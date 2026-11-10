import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { formatPeso } from '@/lib/utils/currency';
import { formatDate } from '@/lib/utils/dates';
import { ReminderService } from '@/services/billing/reminder.service';
import { assertAssistantLandlord } from './data.service';

export const reminderTemplates = {
  en: 'Hi {tenant}, your outstanding bill balance is {balance}, due on {due}. Please submit payment proof after paying. Thank you! - {property}, Room {room}',
  ceb: 'Maayong adlaw, {tenant}. Ang imong nahibiling bayranan kay {balance}, due sa {due}. Palihog isumite ang pamatuod sa pagbayad human makabayad. Salamat! - {property}, Room {room}',
};
export function validReminderTemplate(template: string) {
  if (template.length > 1000 || template.length < 20 || !['{tenant}', '{balance}', '{due}'].every(key => template.includes(key)) || /\{(?!tenant\}|balance\}|due\}|property\}|room\})/.test(template)) throw new Error('Keep {tenant}, {balance} and {due} in the wording. Use up to 1,000 characters.');
  return template.trim();
}

async function billSnapshot(tx: Prisma.TransactionClient, billId: string, landlordId: string) {
  await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId} FOR UPDATE`;
  const bill = await tx.bill.findFirst({ where: { id: billId, property: { landlordId, landlord: { role: 'LANDLORD' } } }, select: {
    id: true, totalAmount: true, dueDate: true, status: true, cancelledAt: true,
    property: { select: { name: true, archivedAt: true } }, tenancy: { select: { status: true, tenant: { select: { name: true, role: true } }, room: { select: { roomNumber: true } } } },
    payments: { where: { voidedAt: null }, select: { amount: true } }, paymentProofs: { where: { status: 'PENDING' }, select: { id: true }, take: 1 },
  } });
  if (!bill) throw new Error('FORBIDDEN');
  const balance = Decimal.max(0, new Decimal(bill.totalAmount).minus(bill.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0))));
  const values = { tenant: bill.tenancy.tenant.name, balance: formatPeso(balance), due: formatDate(bill.dueDate), property: bill.property.name, room: bill.tenancy.room.roomNumber };
  const hash = createHash('sha256').update(JSON.stringify([values, bill.status, bill.cancelledAt, bill.paymentProofs.length])).digest('hex');
  const unavailable = bill.cancelledAt || bill.status === 'CANCELLED' || bill.status === 'PAID' || balance.lte(0) || bill.property.archivedAt || bill.tenancy.tenant.role !== 'TENANT';
  return { bill, values, hash, unavailable: Boolean(unavailable), pendingProof: bill.paymentProofs.length > 0 };
}
function render(template: string, values: Record<string, string>) {
  const message = template.replace(/\{(tenant|balance|due|property|room)\}/g, (_, key: string) => values[key]);
  if (message.length > 1500) throw new Error('The completed reminder is too long. Shorten the wording and preview again.');
  return message;
}

export class AssistantReminders {
  static async preview(landlordId: string, billId: string, language: 'en' | 'ceb', template = reminderTemplates[language]) {
    await assertAssistantLandlord(landlordId); template = validReminderTemplate(template);
    return prisma.$transaction(async tx => {
      const snapshot = await billSnapshot(tx, billId, landlordId);
      if (snapshot.unavailable) throw new Error('This bill has no payable balance or is unavailable.');
      const recent = await tx.assistantReminder.count({ where: { landlordId, billId, status: 'DRAFT' } });
      if (recent >= 10) await tx.assistantReminder.updateMany({ where: { landlordId, billId, status: 'DRAFT' }, data: { status: 'CANCELLED', outcome: 'Replaced by a new preview', finishedAt: new Date() } });
      const draft = await tx.assistantReminder.create({ data: { landlordId, billId, language, template, previewHash: snapshot.hash } });
      return { id: draft.id, template, message: render(template, snapshot.values), pendingProof: snapshot.pendingProof, expiresAt: new Date(draft.createdAt.getTime() + 15 * 60000).toISOString() };
    }, { isolationLevel: 'ReadCommitted' });
  }

  static async schedule(landlordId: string, id: string, scheduledAt: Date, enabled: boolean) {
    await assertAssistantLandlord(landlordId);
    if (!enabled) throw new Error('Explicitly enable scheduled delivery for this recipient.');
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 60000 || scheduledAt.getTime() > Date.now() + 90 * 86400000) throw new Error('Choose a time at least one minute ahead and within 90 days.');
    return prisma.$transaction(async tx => {
      const reference = await tx.assistantReminder.findFirst({ where: { id, landlordId }, select: { billId: true } });
      if (!reference) throw new Error('FORBIDDEN');
      const snapshot = await billSnapshot(tx, reference.billId, landlordId);
      await tx.$queryRaw`SELECT id FROM assistant_reminders WHERE id = ${id} FOR UPDATE`;
      const draft = await tx.assistantReminder.findFirst({ where: { id, landlordId }, select: { status: true, billId: true, createdAt: true, previewHash: true } });
      if (!draft || draft.status !== 'DRAFT') throw new Error('Preview is unavailable or already used.');
      if (draft.createdAt.getTime() < Date.now() - 15 * 60000) throw new Error('Preview expired. Preview the message again.');
      if (snapshot.unavailable || snapshot.pendingProof || snapshot.bill.tenancy.status !== 'ACTIVE') throw new Error('Resolve this bill or pending payment proof before scheduling.');
      if (snapshot.hash !== draft.previewHash) throw new Error('The bill changed. Generate a new preview before scheduling.');
      return tx.assistantReminder.update({ where: { id }, data: { status: 'SCHEDULED', scheduledAt } });
    }, { isolationLevel: 'ReadCommitted' });
  }

  static async send(landlordId: string, id: string, confirmed: boolean, now = new Date(), scheduled = false) {
    if (!confirmed) throw new Error('Confirm the recipient and preview before sending.');
    await assertAssistantLandlord(landlordId);
    return prisma.$transaction(async tx => {
      const reference = await tx.assistantReminder.findFirst({ where: { id, landlordId }, select: { billId: true } });
      if (!reference) throw new Error('FORBIDDEN');
      const snapshot = await billSnapshot(tx, reference.billId, landlordId);
      await tx.$queryRaw`SELECT id FROM assistant_reminders WHERE id = ${id} FOR UPDATE`;
      const draft = await tx.assistantReminder.findFirst({ where: { id, landlordId } });
      if (!draft) throw new Error('FORBIDDEN');
      if (['SENT', 'SKIPPED', 'CANCELLED', 'FAILED'].includes(draft.status)) return { sent: false, reason: 'Already processed: ' + (draft.outcome ?? draft.status) };
      if ((scheduled && (draft.status !== 'SCHEDULED' || !draft.scheduledAt || draft.scheduledAt > now)) || (!scheduled && draft.status !== 'DRAFT')) throw new Error('This preview is not ready for this delivery action.');
      if (!scheduled && draft.createdAt.getTime() < now.getTime() - 15 * 60000) throw new Error('Preview expired. Preview the message again.');
      let outcome = snapshot.unavailable ? 'Bill paid, cancelled or unavailable.' : snapshot.pendingProof ? 'Pending GCash proof - review it before reminding.' : scheduled && snapshot.bill.tenancy.status !== 'ACTIVE' ? 'Tenancy is no longer active.' : '';
      if (!outcome && !scheduled && snapshot.hash !== draft.previewHash) throw new Error('The bill changed. Generate a new preview before sending.');
      const message = outcome ? '' : render(draft.template, snapshot.values);
      const result = outcome ? { sent: false, reason: outcome } : await ReminderService.deliverTx(tx, draft.billId, now, landlordId, message);
      outcome = result.reason;
      await tx.assistantReminder.update({ where: { id }, data: { status: result.sent ? 'SENT' : 'SKIPPED', attemptedAt: now, finishedAt: now, outcome, deliveredMessage: result.sent ? message : null } });
      return result;
    }, { isolationLevel: 'ReadCommitted' });
  }

  static async cancel(landlordId: string, id: string) {
    await assertAssistantLandlord(landlordId);
    const result = await prisma.assistantReminder.updateMany({ where: { id, landlordId, status: { in: ['DRAFT', 'SCHEDULED'] }, bill: { property: { landlordId } } }, data: { status: 'CANCELLED', finishedAt: new Date(), outcome: 'Cancelled by landlord' } });
    if (!result.count) throw new Error('Schedule is unavailable or already processed.');
  }

  static async list(landlordId: string) {
    await assertAssistantLandlord(landlordId);
    return prisma.assistantReminder.findMany({ where: { landlordId, bill: { property: { landlordId } }, status: { not: 'DRAFT' } }, select: { id: true, status: true, scheduledAt: true, outcome: true, bill: { select: { tenancy: { select: { tenant: { select: { name: true } } } } } } }, orderBy: { createdAt: 'desc' }, take: 20 });
  }

  static async runDue(now = new Date(), landlordId?: string) {
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid scheduler time');
    const due = await prisma.assistantReminder.findMany({ where: { landlordId, status: 'SCHEDULED', scheduledAt: { lte: now } }, select: { id: true, landlordId: true }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], take: 100 });
    let sent = 0;
    for (const draft of due) {
      try { if ((await this.send(draft.landlordId, draft.id, true, now, true)).sent) sent++; }
      catch {
        await prisma.assistantReminder.updateMany({ where: { id: draft.id, status: 'SCHEDULED' }, data: { status: 'FAILED', attemptedAt: now, finishedAt: now, outcome: 'Delivery unavailable or access revoked. Preview and schedule again.' } });
      }
    }
    return { checked: due.length, sent };
  }
}
