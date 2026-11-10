import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';

/** Retry only confirmed rolled-back write conflicts. Never retry uncertain commits. */
export async function withTransactionRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1) + randomInt(20)));
    }
  }
}
