import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchema: string | undefined;
};

// Hot reload preserves globals even when a regenerated client has new models.
const schemaKey = createHash('sha256').update(JSON.stringify(Prisma.dmmf.datamodel)).digest('hex');
const cached = globalForPrisma.prisma;
const canReuse = cached && globalForPrisma.prismaSchema === schemaKey &&
  Prisma.dmmf.datamodel.models.every(model => {
    const delegate = model.name[0].toLowerCase() + model.name.slice(1);
    return typeof (cached as unknown as Record<string, { findMany?: unknown }>)[delegate]?.findMany === 'function';
  });

export const prisma = canReuse ? cached :
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchema = schemaKey;
  if (cached && cached !== prisma) void cached.$disconnect().catch(() => {});
}
