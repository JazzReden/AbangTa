import { loadEnvConfig } from '@next/env';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rate-limit';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

test('rejects malformed policies before contacting shared storage', async () => {
  await expect(checkRateLimit('', { limit: 1, windowMs: 1000 })).rejects.toThrow('Invalid rate-limit policy');
  for (const limit of [0, -1, NaN, Infinity, 1.5]) await expect(checkRateLimit('test', { limit, windowMs: 1000 })).rejects.toThrow('Invalid rate-limit policy');
  await expect(checkRateLimit('test', { limit: 1, windowMs: 0 })).rejects.toThrow('Invalid rate-limit policy');
});

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Atomic shared MySQL rate limits', () => {
  const keys: Array<{ key: string; options: { limit: number; windowMs: number } }> = [];
  function fixture(limit = 5, windowMs = 60000) {
    const entry = { key: 'rate-test-' + randomUUID(), options: { limit, windowMs } };
    keys.push(entry); return entry;
  }
  beforeAll(() => { loadEnvConfig(process.cwd()); });
  test('simultaneous callers cannot exceed the shared allowance', async () => {
    const { key, options } = fixture();
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit(key, options)));
    expect(results.filter(result => result.allowed)).toHaveLength(5);
    expect(results.filter(result => !result.allowed)).toHaveLength(15);
    expect(results.filter(result => result.allowed).map(result => result.remaining).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(results.filter(result => !result.allowed).every(result => result.retryAfterSec > 0)).toBe(true);
  });
  test('a separate module instance shares the same database bucket', async () => {
    const { key, options } = fixture(1);
    expect((await checkRateLimit(key, options)).allowed).toBe(true);
    jest.resetModules();
    const second = require('@/lib/security/rate-limit');
    expect((await second.checkRateLimit(key, options)).allowed).toBe(false);
    await resetRateLimit(key, options);
    expect((await second.checkRateLimit(key, options)).allowed).toBe(true);
  });
  test('a different Node process cannot bypass a used allowance', async () => {
    const { key, options } = fixture(1);
    await checkRateLimit(key, options);
    const output = execFileSync(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'),
      path.resolve('src/__tests__/helpers/rate-limit-worker.ts'), JSON.stringify({ key, options })], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test' }, timeout: 15000, encoding: 'utf8',
    });
    expect(JSON.parse(output).allowed).toBe(false);
  });
  test('uses database time and starts a fresh window after expiry', async () => {
    const { key, options } = fixture(1);
    await checkRateLimit(key, options);
    expect((await checkRateLimit(key, options)).allowed).toBe(false);
    const digest = createHash('sha256').update(JSON.stringify([key, options.limit, options.windowMs])).digest('hex');
    await prisma.$executeRaw`UPDATE rate_limit_buckets SET resetAt = TIMESTAMPADD(SECOND, -1, UTC_TIMESTAMP(3)) WHERE \`key\` = ${digest}`;
    expect((await checkRateLimit(key, options)).allowed).toBe(true);
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: digest } })).toMatchObject({ count: 1 });
    expect(digest).not.toContain(key);
  });
  afterAll(async () => {
    for (const { key, options } of keys) await resetRateLimit(key, options);
    await prisma.$disconnect();
  });
});
