import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';

// Read-only health check: never reconcile money or delete application data.
nextEnv.loadEnvConfig(process.cwd(), true);
const prisma = new PrismaClient();
try {
  const mismatches = await prisma.$queryRaw`
    SELECT b.id, b.status, b.amountPaid, COALESCE(p.paid, 0) AS recordedPaid
    FROM bills b LEFT JOIN (
      SELECT billId, SUM(amount) AS paid FROM payments WHERE voidedAt IS NULL GROUP BY billId
    ) p ON p.billId = b.id WHERE b.amountPaid <> COALESCE(p.paid, 0)`;
  console.info(JSON.stringify({ ok: mismatches.length === 0, billBalanceMismatches: mismatches }, null, 2));
  if (mismatches.length) process.exitCode = 1;
} catch {
  console.error('Unable to complete the database integrity check. Check the local database configuration.');
  process.exitCode = 2;
} finally { await prisma.$disconnect(); }
