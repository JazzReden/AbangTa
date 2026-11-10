import { checkRateLimit } from '@/lib/security/rate-limit';
jest.mock('@/lib/db/prisma', () => ({ prisma: {
  $executeRaw: jest.fn().mockResolvedValue(0),
  $transaction: jest.fn().mockRejectedValue(new Error('private-database-connection-details')),
} }));

test('storage failure denies the operation instead of bypassing the shared limit', async () => {
  await expect(checkRateLimit('failure-test')).rejects.toThrow('Security checks are temporarily unavailable');
  try { await checkRateLimit('failure-test'); } catch (error) {
    expect((error as Error).message).not.toContain('private-database');
  }
});
