import { prisma } from '@/lib/db/prisma';
import { operationEvent } from '@/lib/operations/events';

export class OperationalHealth {
  static async started() {
    await prisma.operationHeartbeat.upsert({ where: { name: 'bill-reminders' }, create: { name: 'bill-reminders', lastStartedAt: new Date() }, update: { lastStartedAt: new Date() } });
  }
  static async succeeded() {
    const prior = await prisma.operationHeartbeat.findUnique({ where: { name: 'bill-reminders' } });
    await prisma.operationHeartbeat.upsert({ where: { name: 'bill-reminders' }, create: { name: 'bill-reminders', lastSucceededAt: new Date() }, update: { lastSucceededAt: new Date(), consecutiveFailures: 0 } });
    if (prior?.consecutiveFailures) operationEvent('reminders.recovered');
  }
  static async failed(error: unknown) {
    operationEvent('reminders.failed', error);
    try {
      await prisma.operationHeartbeat.upsert({ where: { name: 'bill-reminders' }, create: { name: 'bill-reminders', lastFailedAt: new Date(), consecutiveFailures: 1 }, update: { lastFailedAt: new Date(), consecutiveFailures: { increment: 1 } } });
    } catch { /* Structured event above remains available when the database is down. */ }
  }
  static async readiness(requireReminders: boolean, now = new Date()) {
    try {
      const heartbeat = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1`;
        return requireReminders ? tx.operationHeartbeat.findUnique({ where: { name: 'bill-reminders' } }) : null;
      }, { maxWait: 2000, timeout: 3000 });
      const age = heartbeat?.lastSucceededAt ? now.getTime() - heartbeat.lastSucceededAt.getTime() : Infinity;
      const healthy = !requireReminders || Boolean(heartbeat && heartbeat.consecutiveFailures === 0 && age >= 0 && age <= 15 * 60000);
      return { ok: healthy, database: 'ok', reminders: requireReminders ? healthy ? 'ok' : 'stale-or-failed' : 'disabled' };
    } catch (error) {
      operationEvent('database.error', error);
      return { ok: false, database: 'unavailable', reminders: requireReminders ? 'unknown' : 'disabled' };
    }
  }
}
