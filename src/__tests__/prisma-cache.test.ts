import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

const cache = globalThis as unknown as { prisma?: any; prismaSchema?: string };
const key = createHash('sha256').update(JSON.stringify(Prisma.dmmf.datamodel)).digest('hex');
const originalClient = cache.prisma;
const originalKey = cache.prismaSchema;

afterEach(async () => {
  if (cache.prisma && cache.prisma !== originalClient) await cache.prisma.$disconnect();
  cache.prisma = originalClient;
  cache.prismaSchema = originalKey;
  jest.resetModules();
});

test('replaces a pre-migration global client missing the room request delegate', async () => {
  const disconnect = jest.fn().mockResolvedValue(undefined);
  const stale = { $disconnect: disconnect };
  cache.prisma = stale;
  cache.prismaSchema = key;
  const { prisma } = require('@/lib/db/prisma');
  expect(prisma).not.toBe(stale);
  expect(typeof prisma.roomAccessRequest.findMany).toBe('function');
  expect(disconnect).toHaveBeenCalledTimes(1);
});

test('reuses a compatible global client rather than opening another connection pool', () => {
  delete cache.prisma;
  delete cache.prismaSchema;
  const first = require('@/lib/db/prisma').prisma;
  jest.resetModules();
  expect(require('@/lib/db/prisma').prisma).toBe(first);
});

test('refreshes the cached client when the generated schema fingerprint changes', () => {
  delete cache.prisma;
  const first = require('@/lib/db/prisma').prisma;
  cache.prismaSchema = 'old-schema';
  jest.resetModules();
  expect(require('@/lib/db/prisma').prisma).not.toBe(first);
});
