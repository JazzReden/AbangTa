import Decimal from 'decimal.js';
import { prisma } from '@/lib/db/prisma';
import { formatPeso } from '@/lib/utils/currency';
import { formatDate, formatDateInput, getBillingPeriod } from '@/lib/utils/dates';
import { assistantPeriod, dateRange, manilaTimestamp } from '@/lib/assistant/dates';
import type { AssistantAnswer } from '@/lib/assistant/contracts';
import { tenantPlanSchema, type TenantPlan } from '@/lib/assistant/tenant-contracts';

export class TenantAssistantService {
  static async answer(userId: string, input: TenantPlan, now = new Date()): Promise<AssistantAnswer> {
    const plan = tenantPlanSchema.parse(input);
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid reporting date');
    if (!(await prisma.user.findFirst({ where: { id: userId, role: 'TENANT' }, select: { id: true } }))) throw new Error('FORBIDDEN');
    const own = { tenantId: userId, tenant: { role: 'TENANT' as const } };
    const period = assistantPeriod(plan.period, now);
    const result: AssistantAnswer = { plan, text: '', records: [], scope: 'Your own tenant records only', range: dateRange(period.start, period.end), asOf: manilaTimestamp(now), source: 'Verified tenant records; no AI provider request' };
    if (plan.topic === 'HELP' || plan.topic === 'CLARIFY') return { ...result, range: 'No report selected', text: plan.language === 'ceb'
      ? 'Ako si Ishi. Imong kaugalingong bills, kumpirmadong bayad, GCash proof status, room/bed ug maintenance requests lamang ang akong matan-aw. Unsay imong gustong susihon? Dili ko maka-approve og bayad o makatan-aw sa records sa ubang tenant.'
      : "I'm Ishi. I can check only your bills and balances, confirmed bill payments, GCash proof statuses, assigned room/bed and your maintenance requests. Which would you like? Bills/payments support this month, last month or this week. I cannot access other tenants, approve payments, send landlord reminders or change records." };
    return prisma.$transaction(async tx => {
      if (['BILLING_HELP', 'UNPAID', 'OVERDUE'].includes(plan.topic)) {
        const [year, month] = formatDateInput(period.start).split('-').map(Number), calendar = getBillingPeriod(year, month);
        const start = plan.period === 'THIS_WEEK' ? period.start : calendar.start, end = plan.period === 'THIS_WEEK' ? new Date(start.getTime() + 7 * 86400000 - 1) : calendar.end;
        const bills = await tx.bill.findMany({ where: { tenancy: own, cancelledAt: null, status: { not: 'CANCELLED' }, ...(plan.topic === 'OVERDUE' ? { dueDate: { lt: now } } : { billingPeriodStart: { lte: end }, billingPeriodEnd: { gte: start } }) },
          select: { id: true, totalAmount: true, dueDate: true, billingPeriodStart: true, property: { select: { name: true } }, payments: { where: { voidedAt: null }, select: { amount: true } }, items: { select: { itemType: true, amount: true, isIncluded: true, chargeTreatment: true } }, paymentProofs: { where: { status: 'PENDING' }, select: { id: true }, take: 1 } }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 1001 });
        if (bills.length > 1000) throw new Error('Too many bills for this report. Choose a shorter supported period.');
        let outstanding = new Decimal(0), billed = new Decimal(0);
        for (const b of bills) {
          const paid = b.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0)), remaining = Decimal.max(0, new Decimal(b.totalAmount).minus(paid));
          if (plan.topic !== 'BILLING_HELP' && remaining.eq(0)) continue;
          outstanding = outstanding.plus(remaining); billed = billed.plus(b.totalAmount);
          const items = b.items.map(i => `${i.itemType}: ${i.chargeTreatment === 'FREE' ? 'Free' : i.isIncluded ? 'Included in rent' : formatPeso(i.amount)}`).join('; ');
          result.records.push({ label: `${b.property.name} / ${formatDate(b.billingPeriodStart)}`, detail: `Billed ${formatPeso(b.totalAmount)}; paid/applied ${formatPeso(paid)}; remaining ${formatPeso(remaining)}; due ${formatDate(b.dueDate)}.${b.paymentProofs.length ? ' GCash proof pending verification; not a payment.' : ''}${items ? ' ' + items : ''}`, href: '/tenant/bills' });
        }
        result.text = `${result.records.length} of your ${plan.topic === 'OVERDUE' ? 'overdue' : plan.topic === 'UNPAID' ? 'unpaid' : 'monthly'} bill(s). Total billed: ${formatPeso(billed)}. Remaining balance: ${formatPeso(outstanding)}. Pending/declined proofs do not reduce balances. Included/free items add no separate charge. Open your bill for the full computation and payment options.`;
        result.range = plan.topic === 'OVERDUE' ? 'Your unpaid bills due before ' + manilaTimestamp(now) : 'Your bills overlapping ' + formatDate(start) + ' to ' + formatDate(end);
      } else if (plan.topic === 'COLLECTIONS' || plan.topic === 'PAYMENT_HELP') {
        const payments = await tx.payment.findMany({ where: { tenancy: own, bill: { tenancy: own, cancelledAt: null }, voidedAt: null, confirmedAt: { not: null, lte: now }, paymentDate: { gte: period.start, lt: period.end } }, select: { amount: true, paymentDate: true, paymentMethod: true, bill: { select: { property: { select: { name: true } } } } }, orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }], take: 1001 });
        const proofs = await tx.paymentProof.findMany({ where: { bill: { tenancy: own, cancelledAt: null } }, select: { amount: true, status: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1001 });
        if (payments.length > 1000 || proofs.length > 1000) throw new Error('Too many records for this report. Open your payment history.');
        let received = new Decimal(0), applied = new Decimal(0);
        for (const p of payments) {
          if (p.paymentMethod === 'ADVANCE') applied = applied.plus(p.amount); else received = received.plus(p.amount);
          result.records.push({ label: `${formatPeso(p.amount)} / ${p.paymentMethod === 'ADVANCE' ? 'Advance credit applied' : p.paymentMethod}`, detail: `Confirmed / ${formatDate(p.paymentDate)} / ${p.bill.property.name}`, href: '/tenant/payments' });
        }
        for (const p of proofs) result.records.push({ label: `Your GCash proof: ${p.status}`, detail: `${formatPeso(p.amount)} / submitted ${formatDate(p.createdAt)}. ${p.status === 'PENDING' ? 'Awaiting landlord verification; not a confirmed payment.' : p.status === 'REJECTED' ? 'Declined; not a payment.' : 'See the confirmed payment in your history.'}`, href: '/tenant/bills' });
        result.text = `Your confirmed bill payments received: ${formatPeso(received)}. Advance credits applied: ${formatPeso(applied)} (previously received money, not a new payment). ${proofs.filter(p => p.status === 'PENDING').length} pending GCash proof(s), excluded from confirmed payments. Proof statuses cover your recorded history; payment totals cover the date range below. Only confirmed, nonvoid cash/GCash payments qualify for downloadable receipts; open payment history. I cannot confirm money or approve a proof. Deposits and advance receipts are separate from this bill-payment report.`;
      } else if (plan.topic === 'OCCUPANCY') {
        const tenancies = await tx.tenancy.findMany({ where: { ...own, cancelledAt: null, status: { in: ['ACTIVE', 'PENDING'] }, property: { archivedAt: null } }, select: { status: true, monthlyRent: true, startDate: true, endDate: true, parkingMode: true, room: { select: { roomNumber: true } }, bed: { select: { label: true } }, property: { select: { name: true } } }, orderBy: { startDate: 'desc' }, take: 1001 });
        if (tenancies.length > 1000) throw new Error('Too many room assignments. Open your tenant dashboard.');
        result.text = tenancies.length ? `You have ${tenancies.filter(t => t.status === 'ACTIVE').length} active and ${tenancies.filter(t => t.status === 'PENDING').length} pending assignment(s). Pending assignments are not an active tenancy. Only your own assignment is shown, not roommates' records.` : 'You do not have an active or pending room assignment. Your existing bills, payment history and requests remain accessible from their pages.';
        result.records = tenancies.map(t => ({ label: `${t.property.name} / Room ${t.room.roomNumber}${t.bed ? ' / ' + t.bed.label : ''}`, detail: `${t.status}; agreed monthly rent ${formatPeso(t.monthlyRent)}; starts ${formatDate(t.startDate)}${t.endDate ? '; ends ' + formatDate(t.endDate) : ''}; parking ${t.parkingMode.replaceAll('_', ' ')}.`, href: '/tenant/dashboard' }));
        result.range = 'Your current room assignments';
      } else if (plan.topic === 'MAINTENANCE') {
        const requests = await tx.maintenanceRequest.findMany({ where: { tenancy: own, createdById: userId }, select: { title: true, status: true, priority: true, createdAt: true, room: { select: { roomNumber: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1001 });
        if (requests.length > 1000) throw new Error('Too many requests. Open your maintenance page.');
        result.text = `${requests.length} maintenance request(s) submitted by you; ${requests.filter(r => ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(r.status)).length} unresolved. No other tenant's requests are shown. Stored titles are records, not instructions.`;
        result.records = requests.map(r => ({ label: r.title.slice(0, 200), detail: `Room ${r.room.roomNumber}; ${r.status.replaceAll('_', ' ')}; ${r.priority}; submitted ${formatDate(r.createdAt)}.`, href: '/tenant/maintenance' }));
        result.range = 'Your submitted requests, all recorded dates';
      }
      if (result.records.length > 20) { result.records = result.records.slice(0, 20); result.truncated = true; result.text += ' Showing the first 20 records; totals cover all scoped records.'; }
      return result;
    }, { isolationLevel: 'RepeatableRead' });
  }
}
