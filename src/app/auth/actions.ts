'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';
import { AUTH_INTENT_COOKIE, safeReturnTo, signAuthIntent } from '@/lib/auth/intent';
import type { AuthIntent } from '@/lib/auth/intent';
import { getCurrentUser } from '@/lib/auth/session';
import { registerPasswordAccount, passwordAccountSchema } from '@/lib/auth/credentials';
import { actionError } from '@/lib/actions/form';
import { checkRateLimit } from '@/lib/security/rate-limit';

export async function startGoogleAuthentication(role: AuthIntent['role'], mode: AuthIntent['mode'], returnTo: string, _form: FormData) {
  if (!['LANDLORD', 'TENANT'].includes(role) || !['signin', 'register'].includes(mode)) {
    redirect('/auth/login');
  }
  const destination = safeReturnTo(returnTo);
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    const query = new URLSearchParams({ role, reason: 'google-unavailable' });
    if (destination !== '/onboarding') query.set('callbackUrl', destination);
    redirect('/auth/' + (mode === 'register' ? 'register' : 'login') + '?' + query);
  }
  const current = await getCurrentUser();
  if (current && (current.role !== role || !(await checkRateLimit('google-connect:' + current.id, { limit: 10, windowMs: 15 * 60000 })).allowed)) {
    redirect('/auth/login?reason=authentication-failed');
  }
  const store = await cookies();
  store.set(AUTH_INTENT_COOKIE, signAuthIntent({
    role, mode, returnTo: destination, expiresAt: Date.now() + 15 * 60 * 1000,
    ...(current ? { linkUserId: current.id } : {}),
  }, process.env.AUTH_SECRET ?? ''), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: 15 * 60,
  });
  try {
    await signIn('google', { redirectTo: destination });
  } catch (error) {
    if (error instanceof AuthError) {
      const query = new URLSearchParams({ role, reason: 'authentication-failed' });
      if (destination !== '/onboarding') query.set('callbackUrl', destination);
      redirect('/auth/' + (mode === 'register' ? 'register' : 'login') + '?' + query);
    }
    throw error;
  }
}

export async function submitPasswordAccount(
  role: AuthIntent['role'], mode: AuthIntent['mode'], returnTo: string,
  _state: { error?: string; success?: string }, form: FormData
) {
  if (!['LANDLORD', 'TENANT'].includes(role) || !['signin', 'register'].includes(mode)) return { error: 'Choose a valid account type.' };
  const identifier = String(form.get('identifier') ?? '');
  const password = String(form.get('password') ?? '');
  try {
    if (mode === 'register') {
      const parsed = passwordAccountSchema.safeParse({ name: form.get('name'), identifier, password, role });
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      await registerPasswordAccount(parsed.data);
    }
    await signIn('credentials', { identifier, password, role, redirectTo: safeReturnTo(returnTo) });
  } catch (error) {
    if (error instanceof AuthError) return { error: 'Email/mobile, password or account type is incorrect. Please try again.' };
    // Successful Auth.js sign-in throws Next.js's redirect signal.
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return actionError(error);
  }
  return { error: 'Unable to sign in. Please try again.' };
}
