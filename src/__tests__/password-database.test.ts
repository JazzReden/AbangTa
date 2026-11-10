import { loadEnvConfig } from '@next/env';
import { randomInt, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { registerPasswordAccount, authenticatePassword, findAccountForGoogle } from '@/lib/auth/credentials';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('password account database integration', () => {
  const marker = 'credential-test-' + randomUUID();
  const email = marker + '@example.test';
  const password = 'StrongPassword123';
  let mobile: string;
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    // Allocate a test number that is not already used by an actual account.
    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = '+63999' + randomInt(1000000, 10000000);
      if (!await prisma.user.findUnique({ where: { mobileLogin: candidate } })) {
        mobile = candidate; break;
      }
    }
    if (!mobile) throw new Error('No available test mobile identifier');
  });
  test('email registration hashes passwords, creates the selected role/profile, and supports login', async () => {
    const user = await registerPasswordAccount({ name: marker, identifier: email.toUpperCase(), password, role: 'LANDLORD' });
    expect(user.email).toBe(email);
    expect(user.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    expect(await prisma.landlordProfile.findUnique({ where: { userId: user.id } })).not.toBeNull();
    expect(await authenticatePassword({ identifier: email, password: 'incorrect', role: 'LANDLORD' })).toBeNull();
    expect(await authenticatePassword({ identifier: email, password, role: 'TENANT' })).toBeNull();
    expect((await authenticatePassword({ identifier: email, password, role: 'LANDLORD' }))?.id).toBe(user.id);
    await expect(registerPasswordAccount({ name: marker, identifier: email, password, role: 'LANDLORD' })).rejects.toThrow('already uses');
  });
  test('mobile-only registration stores no invented email and supports normalized login', async () => {
    const user = await registerPasswordAccount({ name: marker, identifier: mobile, password, role: 'TENANT' });
    expect(user.email).toBeNull();
    expect(user.mobileLogin).toBe(mobile);
    expect(user.phone).toBe(mobile);
    expect(await prisma.tenantProfile.findUnique({ where: { userId: user.id } })).not.toBeNull();
    const local = '0' + mobile.slice(3);
    expect((await authenticatePassword({ identifier: local, password, role: 'TENANT' }))?.id).toBe(user.id);
    const googleEmail = marker + '-google@example.test';
    expect(await findAccountForGoogle(googleEmail)).toBeNull();
    expect((await findAccountForGoogle(googleEmail, user.id))?.id).toBe(user.id);
    await expect(registerPasswordAccount({ name: marker, identifier: local, password, role: 'TENANT' })).rejects.toThrow('already uses');
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { name: marker }, select: { id: true } });
    const ids = users.map(user => user.id);
    await prisma.landlordProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tenantProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
});
