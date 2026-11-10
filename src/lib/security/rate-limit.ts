import { withTransactionRetry } from '@/lib/db/transaction-retry';
import { createHash, randomInt } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

export interface RateLimitOptions { limit: number; windowMs: number }
const defaults: RateLimitOptions = { limit: 5, windowMs: 15 * 60000 };
function digest(key: string, options: RateLimitOptions) {
  // Policy changes cannot accidentally reuse a differently sized window.
  return createHash('sha256').update(JSON.stringify([key, options.limit, options.windowMs])).digest('hex');
}
function validate(key: string, options: RateLimitOptions) {
  if (!key || key.length > 1024 || !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 1000000 ||
    !Number.isSafeInteger(options.windowMs) || options.windowMs < 1 || options.windowMs > 86400000) throw new Error('Invalid rate-limit policy');
}

export async function checkRateLimit(key: string, options: RateLimitOptions = defaults) {
  validate(key, options);
  const bucketKey = digest(key, options);
  try {
    // Bounded opportunistic cleanup; expired rows never affect enforcement.
    if (randomInt(100) === 0) await prisma.$executeRaw`DELETE FROM rate_limit_buckets WHERE resetAt <= UTC_TIMESTAMP(3) LIMIT 100`;
    const micros = options.windowMs * 1000;
    // Initialize in autocommit mode: concurrent inserts must not hold shared
    // duplicate-key locks while trying to upgrade to the counter's write lock.
    await prisma.$executeRaw`INSERT IGNORE INTO rate_limit_buckets (\`key\`, count, resetAt)
        VALUES (${bucketKey}, 0, TIMESTAMPADD(MICROSECOND, ${micros}, UTC_TIMESTAMP(3)))
        `;
    return await withTransactionRetry(() => prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<Array<{ count: number | bigint; resetAt: Date; now: Date }>>`
        SELECT count, resetAt, UTC_TIMESTAMP(3) AS now FROM rate_limit_buckets WHERE \`key\` = ${bucketKey} FOR UPDATE`;
      if (!row) throw new Error('Missing rate-limit bucket');
      const expired = row.resetAt.getTime() <= row.now.getTime();
      const count = expired ? 0 : Number(row.count);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid rate-limit counter');
      const resetAt = expired ? new Date(row.now.getTime() + options.windowMs) : row.resetAt;
      if (count >= options.limit) return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((resetAt.getTime() - row.now.getTime()) / 1000)) };
      await tx.$executeRaw`UPDATE rate_limit_buckets SET count = ${count + 1}, resetAt = ${resetAt} WHERE \`key\` = ${bucketKey}`;
      return { allowed: true, remaining: options.limit - count - 1, retryAfterSec: 0 };
    }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 5000 }));
  } catch (cause) {
    // Never silently downgrade to per-process limits if shared storage fails.
    throw new Error('Security checks are temporarily unavailable. Please try again shortly.', { cause });
  }
}

export async function resetRateLimit(key: string, options: RateLimitOptions = defaults) {
  validate(key, options);
  await prisma.$executeRaw`DELETE FROM rate_limit_buckets WHERE \`key\` = ${digest(key, options)}`;
}
