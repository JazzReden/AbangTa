import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export default async function OnboardingPage() {
  const user = await requireAuth();
  const account = await prisma.user.findUnique({
    where: { id: user.id }, include: { tenantProfile: true, landlordProfile: true },
  });
  if (account?.landlordProfile) redirect('/landlord/dashboard');
  if (account?.tenantProfile) redirect('/tenant/dashboard');
  async function chooseRole(form: FormData) {
    'use server';
    const current = await requireAuth();
    const role = form.get('role');
    if (role !== 'LANDLORD' && role !== 'TENANT') throw new Error('Invalid account type');
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${current.id} FOR UPDATE`;
      const existing = await tx.user.findUnique({
        where: { id: current.id },
        include: { tenantProfile: true, landlordProfile: true, _count: { select: { tenancies: true } } },
      });
      if (!existing || existing.landlordProfile || existing.tenantProfile || existing._count.tenancies) {
        throw new Error('Your account type is already set');
      }
      await tx.user.update({
        where: { id: current.id },
        data: role === 'LANDLORD'
          ? { role, landlordProfile: { create: {} } }
          : { role, tenantProfile: { create: {} } },
      });
    }, { isolationLevel: 'ReadCommitted' });
    redirect(role === 'LANDLORD' ? '/landlord/dashboard' : '/tenant/dashboard');
  }
  return (
    <main className="mx-auto max-w-md p-6 space-y-5">
      <h1 className="text-2xl font-bold">Welcome to AbangTa</h1>
      <p>Choose your account type.</p>
      <form action={chooseRole} className="space-y-3">
        <button name="role" value="LANDLORD" className="w-full rounded-lg bg-primary p-3 text-white">I manage properties</button>
        <button name="role" value="TENANT" className="w-full rounded-lg border p-3">I am a tenant</button>
      </form>
    </main>
  );
}
