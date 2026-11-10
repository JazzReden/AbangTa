import type { NextAuthConfig } from 'next-auth';

// Middleware must never import Prisma or the Node-only password implementation.
export const authConfig = {
  providers: [],
  pages: { signIn: '/auth/login', error: '/auth/login' },
  session: { strategy: 'jwt', maxAge: 24 * 60 * 60 },
  callbacks: {
    async session({ session, token }) {
      session.user.id = String(token.id ?? '');
      session.user.role = token.role === 'LANDLORD' ? 'LANDLORD' : 'TENANT';
      return session;
    },
  },
} satisfies NextAuthConfig;
