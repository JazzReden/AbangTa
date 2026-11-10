import { loadEnvConfig } from '@next/env';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { prisma } from '@/lib/db/prisma';

loadEnvConfig(process.cwd());
async function main() {
  try {
    const { key, options } = JSON.parse(process.argv[2]);
    const result = await checkRateLimit(key, options);
    process.stdout.write(JSON.stringify(result));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { process.exitCode = 1; });
