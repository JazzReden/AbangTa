import { cache } from 'react';
import { auth } from '@/lib/auth';
import type { SessionUser } from '@/types';
import { prisma } from '@/lib/db/prisma';

/**
 * Get the current session user.
 * Returns null if not authenticated.
 */
// React cache deduplicates within one server render, never across requests/users.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user) return null;
  const account = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, mobileLogin: true, phone: true, role: true, name: true } });
  if (!account) return null;

  return {
    id: session.user.id as string,
    email: account.email ?? account.mobileLogin ?? account.phone ?? '',
    name: account.name,
    role: account.role,
    avatarUrl: session.user.image,
  };
});

/**
 * Require authentication. Throws if not authenticated.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

/**
 * Require landlord role. Throws if not a landlord.
 */
export async function requireLandlord(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== 'LANDLORD') {
    throw new Error('FORBIDDEN');
  }
  return user;
}

/**
 * Require tenant role. Throws if not a tenant.
 */
export async function requireTenant(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== 'TENANT') {
    throw new Error('FORBIDDEN');
  }
  return user;
}
