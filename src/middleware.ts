import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';

const { auth } = NextAuth(authConfig);

export default auth(function middleware(req) {
  const { nextUrl, auth: session } = req as NextRequest & { auth: { user?: { role?: string } } | null };
  const isAuthenticated = !!session?.user;

  // Public paths that do not require authentication
  const publicPaths = ['/auth/login', '/auth/register', '/join', '/'];
  const isPublicPath = publicPaths.some(
    (path) => nextUrl.pathname === path || nextUrl.pathname.startsWith('/api/auth')
  );

  if (!isAuthenticated && !isPublicPath) {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  // Protected layouts and actions check the current database role, not a stale JWT.

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
});

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/landlord/:path*',
    '/tenant/:path*',
    '/onboarding/:path*',
  ],
};
