// Run with: ABANGTA_DB_TESTS=1 DATABASE_URL=... node --import tsx scripts/benchmark-payment-history.mjs
// Use a disposable local database whose name ends in _test, with migrations applied.
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/db/prisma.ts';
import { PaymentService } from '../src/services/billing/payment.service.ts';

async function benchmark() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.ABANGTA_DB_TESTS !== '1' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Benchmark requires ABANGTA_DB_TESTS=1 and a disposable local database ending in _test.');
  }
  const users = [];
  let propertyId, tenancyId, billId;
  try {
    const marker = 'history-benchmark-' + randomUUID();
    for (const role of ['LANDLORD', 'TENANT']) users.push((await prisma.user.create({ data: { name: marker, role, passwordHash: 'fixture-only' } })).id);
    const property = await prisma.property.create({ data: { landlordId: users[0], name: 'History benchmark', address: 'Fixture only', rooms: { create: { roomNumber: '101', monthlyRent: 2000 } } }, include: { rooms: true } });
    propertyId = property.id;
    tenancyId = (await prisma.tenancy.create({ data: { tenantId: users[1], propertyId, roomId: property.rooms[0].id, startDate: new Date(), monthlyRent: 2000, status: 'ACTIVE' } })).id;
    billId = (await prisma.bill.create({ data: { tenancyId, propertyId, createdById: users[0], billingPeriodStart: new Date(), billingPeriodEnd: new Date(), dueDate: new Date(), totalAmount: 2000, amountPaid: 2000, status: 'PAID' } })).id;
    await prisma.payment.createMany({ data: Array.from({ length: 2000 }, () => ({ id: randomUUID(), billId, tenancyId, recordedById: users[0], amount: 1, paymentDate: new Date('2026-10-01'), paymentMethod: 'CASH', confirmedAt: new Date(), notes: 'Fixture benchmark' })) });
    // Original history query, retained here only as a laboratory comparison.
    const before = () => prisma.payment.findMany({ where: { tenancy: { tenantId: users[1] }, voidedAt: null }, include: { bill: { select: { id: true, billingPeriodStart: true, status: true } } }, orderBy: { paymentDate: 'desc' } });
    const after = () => PaymentService.getTenantPayments(users[1]);
    await before(); await after();
    const samples = { before: [], after: [] };
    const results = {};
    for (let run = 0; run < 11; run++) {
      for (const name of (run % 2 ? ['after', 'before'] : ['before', 'after'])) {
        const start = performance.now();
        results[name] = await (name === 'before' ? before() : after());
        samples[name].push(performance.now() - start);
      }
    }
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    console.log(JSON.stringify({
      fixturePayments: 2000, runs: 11,
      before: { rows: results.before.length, jsonBytes: Buffer.byteLength(JSON.stringify(results.before)), medianMs: median(samples.before) },
      after: { rows: results.after.payments.length, jsonBytes: Buffer.byteLength(JSON.stringify(results.after)), medianMs: median(samples.after) },
      note: 'Local warm fixture benchmark; not real-user latency, HTTP transfer size or production throughput.',
    }, null, 2));
  } finally {
    // Remove only records created above; never reset or seed the configured database.
    if (billId) { await prisma.payment.deleteMany({ where: { billId } }); await prisma.bill.delete({ where: { id: billId } }); }
    if (tenancyId) await prisma.tenancy.delete({ where: { id: tenancyId } });
    if (propertyId) { await prisma.room.deleteMany({ where: { propertyId } }); await prisma.property.delete({ where: { id: propertyId } }); }
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
benchmark().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
