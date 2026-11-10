import { Prisma } from '@prisma/client';
import { withTransactionRetry } from '@/lib/db/transaction-retry';

const deadlock = () => new Prisma.PrismaClientKnownRequestError('Conflict', { code: 'P2034', clientVersion: '5.22.0' });
test('retries rolled-back conflicts, returning the single committed result', async () => {
  const operation = jest.fn().mockRejectedValueOnce(deadlock()).mockResolvedValue('committed');
  expect(await withTransactionRetry(operation)).toBe('committed');
  expect(operation).toHaveBeenCalledTimes(2);
});
test('persistent conflicts have a bounded number of attempts', async () => {
  const error = deadlock(), operation = jest.fn().mockRejectedValue(error);
  await expect(withTransactionRetry(operation)).rejects.toBe(error);
  expect(operation).toHaveBeenCalledTimes(3);
});
test.each(['P2002', 'P2028', 'P1001'])('does not replay non-conflict errors or uncertain outcomes: %s', async code => {
  const error = new Prisma.PrismaClientKnownRequestError('Do not replay', { code, clientVersion: '5.22.0' });
  const operation = jest.fn().mockRejectedValue(error);
  await expect(withTransactionRetry(operation)).rejects.toBe(error);
  expect(operation).toHaveBeenCalledTimes(1);
});
