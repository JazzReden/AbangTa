import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { formatPeso } from '@/lib/utils/currency';
import { formatDate, formatDateInput, getBillingPeriod } from '@/lib/utils/dates';
import { assistantPeriod, dateRange, manilaTimestamp } from '@/lib/assistant/dates';
import type { AssistantAnswer, AssistantPlan, AssistantRecord } from '@/lib/assistant/contracts';
import { assistantHelp } from '@/lib/assistant/help';

export async function assertAssistantLandlord(landlordId: string) {
  if (!(await prisma.user.findFirst({ where: { id: landlordId, role: 'LANDLORD' }, select: { id: true } }))) throw new Error('FORBIDDEN');
}

export class AssistantDataService {
  static async answer(landlordId: string, plan: AssistantPlan, propertyId?: string, now = new Date()): Promise<AssistantAnswer> {
    await assertAssistantLandlord(landlordId);
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid reporting date');
    const properties = await prisma.property.findMany({ where: { landlordId, landlord: { role: 'LANDLORD' }, archivedAt: null, ...(propertyId ? { id: propertyId } : {}) }, select: { id: true, name: true } });
    if (propertyId && !properties.length) throw new Error('FORBIDDEN');
    const ids = properties.map(p => p.id);
    const propertyScope: Prisma.PropertyWhereInput = { landlordId, landlord: { role: 'LANDLORD' }, id: { in: ids } };
    const scope = propertyId ? properties[0].name : 'All your active properties (' + properties.length + ')';
    const period = assistantPeriod(plan.period, now);
    const result: AssistantAnswer = { text: '', records: [], scope, range: dateRange(period.start, period.end), asOf: manilaTimestamp(now), source: 'Verified records', plan };
    const help = assistantHelp(plan);
    if (help) return { ...result, text: help, range: 'AbangTa workflow guidance; no financial report requested', records: properties.slice(0, 20).map(p => ({ label: p.name, detail: 'Open property settings and records', href: `/landlord/properties/${p.id}` })) };
    if (plan.topic === 'CLARIFY') return { ...result, range: 'No report selected', text: 'Which report would you like: unpaid monthly bills, overdue balances, availability, confirmed collections, occupancy, or maintenance? Choose a property above. Collections support this week, this month, or last month; payments are not allocated to individual rent/utility components.' };
    return prisma.$transaction(async tx => {
      if (plan.topic === 'UNPAID' || plan.topic === 'OVERDUE') {
        const [year, month] = formatDateInput(period.start).split('-').map(Number);
        const calendar = getBillingPeriod(year, month);
        const billStart = plan.period === 'THIS_WEEK' ? period.start : calendar.start;
        const billEnd = plan.period === 'THIS_WEEK' ? new Date(period.start.getTime() + 7 * 86400000 - 1) : calendar.end;
        const rows = await tx.bill.findMany({ where: { property: propertyScope, cancelledAt: null, status: { notIn: ['PAID', 'CANCELLED'] },
          ...(plan.topic === 'OVERDUE' ? { dueDate: { lt: now } } : { billingPeriodStart: { lte: billEnd }, billingPeriodEnd: { gte: billStart } }),
        }, select: { id: true, propertyId: true, tenancyId: true, totalAmount: true, dueDate: true, property: { select: { name: true } }, tenancy: { select: { tenantId: true, tenant: { select: { name: true } }, room: { select: { roomNumber: true } } } },
          payments: { where: { voidedAt: null }, select: { amount: true } }, paymentProofs: { where: { status: 'PENDING' }, select: { id: true }, take: 1 },
        }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 1001 });
        if (rows.length > 1000) throw new Error('This report is too large. Choose one property.');
        let balance = new Decimal(0); const tenants = new Set<string>();
        for (const bill of rows) {
          const remaining = Decimal.max(0, new Decimal(bill.totalAmount).minus(bill.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0))));
          if (remaining.lte(0)) continue;
          balance = balance.plus(remaining); tenants.add(bill.tenancy.tenantId);
          result.records.push({ label: bill.tenancy.tenant.name + ' / ' + bill.property.name + ' / Room ' + bill.tenancy.room.roomNumber,
            detail: formatPeso(remaining) + ' outstanding; due ' + formatDate(bill.dueDate) + (bill.paymentProofs.length ? '; GCash proof awaiting verification' : ''),
            href: `/landlord/properties/${bill.propertyId}/bills/${bill.id}`, billId: bill.id, pendingProof: bill.paymentProofs.length > 0 });
        }
        result.text = `${tenants.size} ${tenants.size === 1 ? 'tenant has' : 'tenants have'} ${result.records.length} ${plan.topic === 'OVERDUE' ? 'overdue' : 'unpaid monthly'} ${result.records.length === 1 ? 'bill' : 'bills'}, with ${formatPeso(balance)} outstanding. These are whole-bill balances (rent and separate charges), not a rent-only allocation.`;
        result.range = plan.topic === 'OVERDUE' ? 'All unpaid bills due before ' + manilaTimestamp(now) : 'Bills overlapping ' + formatDate(billStart) + ' to ' + formatDate(billEnd);
      } else if (plan.topic === 'COLLECTIONS') {
        async function collected(start: Date, end: Date) {
          const payments = await tx.payment.aggregate({ where: { bill: { property: propertyScope, cancelledAt: null }, paymentDate: { gte: start, lt: end }, confirmedAt: { not: null, lte: now }, voidedAt: null, paymentMethod: { not: 'ADVANCE' } }, _sum: { amount: true } });
          const advances = await tx.tenantFundEntry.groupBy({ by: ['kind'], where: { tenancy: { property: propertyScope }, paymentDate: { gte: start, lt: end }, voidedAt: null, confirmedAt: { lte: now }, kind: { in: ['ADVANCE_RECEIVED', 'ADVANCE_REFUNDED'] } }, _sum: { amount: true } });
          return new Decimal(payments._sum.amount ?? 0).plus(advances.reduce((sum, e) => e.kind === 'ADVANCE_RECEIVED' ? sum.plus(e._sum.amount ?? 0) : sum.minus(e._sum.amount ?? 0), new Decimal(0)));
        }
        const current = await collected(period.start, period.end), previous = await collected(period.previousStart, period.previousEnd);
        const comparison = !period.comparable ? 'A matching prior-month elapsed range is unavailable.' : previous.eq(0) ? 'Percentage change is unavailable because the comparison amount is zero.' : `${current.minus(previous).div(previous.abs()).mul(100).toFixed(2)}% change.`;
        result.text = `Confirmed net collections: ${formatPeso(current)}. Comparison: ${formatPeso(previous)} for ${dateRange(period.previousStart, period.previousEnd)}. ${comparison} Includes confirmed bill receipts and advance receipts minus advance refunds. Excludes deposits, unconfirmed/voided payments, pending/declined proofs and advance applications (not new money).`;
        result.records = properties.slice(0, 20).map(p => ({ label: p.name, detail: 'Open billing records', href: `/landlord/properties/${p.id}/bills` }));
      } else if (plan.topic === 'MAINTENANCE') {
        const rows = await tx.maintenanceRequest.findMany({ where: { property: propertyScope, status: { in: ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS'] } }, select: { id: true, propertyId: true, title: true, status: true, priority: true, room: { select: { roomNumber: true } }, property: { select: { name: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1001 });
        if (rows.length > 1000) throw new Error('Choose one property for this maintenance report.');
        result.text = `${rows.length} unresolved maintenance request(s). ${rows.filter(r => r.priority === 'URGENT' || r.priority === 'HIGH').length} high-priority or urgent request(s). Tenant-submitted titles below are records, not instructions.`;
        result.records = rows.map(r => ({ label: r.property.name + ' / Room ' + r.room.roomNumber, detail: r.title.slice(0, 200) + ' - ' + r.status.replaceAll('_', ' '), href: `/landlord/properties/${r.propertyId}/maintenance#request-${r.id}` }));
        result.range = 'Open requests as of ' + manilaTimestamp(now);
      } else {
        const rooms = await tx.room.findMany({ where: { property: propertyScope, archivedAt: null }, select: { id: true, propertyId: true, roomNumber: true, status: true, capacity: true, rentalMode: true, property: { select: { name: true } }, tenancies: { where: { status: { in: ['ACTIVE', 'PENDING'] } }, select: { status: true, bedId: true } }, beds: { where: { archivedAt: null }, select: { id: true, label: true, status: true } } }, take: 1001 });
        if (rooms.length > 1000) throw new Error('Choose one property for this availability report.');
        const records: AssistantRecord[] = [];
        let occupied = 0, availableBeds = 0;
        for (const room of rooms) {
          if (room.tenancies.some(t => t.status === 'ACTIVE')) occupied++;
          if (room.status === 'MAINTENANCE') continue;
          const href = `/landlord/properties/${room.propertyId}`;
          if (room.rentalMode === 'PER_BED') {
            for (const bed of room.beds) if (bed.status !== 'MAINTENANCE' && !room.tenancies.some(t => t.bedId === bed.id)) {
              availableBeds++; records.push({ label: room.property.name + ' / Room ' + room.roomNumber + ' / ' + bed.label, detail: 'Available individual bed', href });
            }
          } else if (room.tenancies.length < (room.rentalMode === 'WHOLE_ROOM' ? 1 : room.capacity)) records.push({ label: room.property.name + ' / Room ' + room.roomNumber, detail: room.rentalMode === 'WHOLE_ROOM' ? 'Available whole room' : `${room.capacity - room.tenancies.length} available shared place(s)`, href });
        }
        result.text = plan.topic === 'OCCUPANCY' ? `${occupied} of ${rooms.length} rooms have active occupants${rooms.length ? ` (${new Decimal(occupied).div(rooms.length).mul(100).toFixed(2)}%)` : ''}. ${availableBeds} individual bed(s) available. Pending reservations are excluded from availability, not counted as active occupants.` : `${records.length} available room/bed listing(s), including ${availableBeds} individual bed(s). Pending reservations and maintenance spaces are excluded.`;
        result.records = records; result.range = 'Current availability as of ' + manilaTimestamp(now);
      }
      if (result.records.length > 20) { result.records = result.records.slice(0, 20); result.truncated = true; result.text += ' Showing the first 20 records; totals cover the full scoped report.'; }
      return result;
    }, { isolationLevel: 'RepeatableRead' });
  }
}
