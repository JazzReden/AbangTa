import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './config';
import { cookies } from 'next/headers';
import { AUTH_INTENT_COOKIE, readAuthIntent } from './intent';
import { authenticatePassword } from './credentials';
import { googleAccount, googleIdentitySchema } from './google-account';

async function currentIntent() {
  return readAuthIntent((await cookies()).get(AUTH_INTENT_COOKIE)?.value, process.env.AUTH_SECRET ?? '');
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [Credentials({
    credentials: { identifier: {}, password: {}, role: {} },
    authorize: authenticatePassword,
  }), Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
    checks: ['pkce', 'state'],
    authorization: { params: { prompt: 'select_account' } },
  })],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile, user }) {
      if (account?.provider === 'credentials') return Boolean(user?.id);
      if (account?.provider !== 'google' || profile?.email_verified !== true ||
        typeof profile.email !== 'string' || typeof profile.sub !== 'string') return false;
      const intent = await currentIntent();
      if (!intent) return '/auth/login?reason=expired-flow';
      try { await googleAccount(profile, intent); }
      catch (error) {
        const allowed = ['wrong-role', 'create-account', 'account-exists', 'identity-mismatch', 'password-first'];
        const reason = error instanceof Error && allowed.includes(error.message) ? error.message : 'authentication-failed';
        const query = new URLSearchParams({ role: intent.role, reason });
        if (intent.returnTo !== '/onboarding') query.set('callbackUrl', intent.returnTo);
        return '/auth/' + (intent.mode === 'register' ? 'register' : 'login') + '?' + query;
      }
      return true;
    },
    async jwt({ token, account, profile, user: credentialUser }) {
      if (account?.provider === 'credentials' && credentialUser) {
        token.id = credentialUser.id!;
        token.role = credentialUser.role;
      }
      if (account?.provider === 'google' && profile) {
        const intent = await currentIntent();
        if (!intent) throw new Error('Authentication session expired');
        const user = await googleAccount(googleIdentitySchema.parse(profile), intent, true);
        if (!user) throw new Error('Authentication failed');
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
  },
});
