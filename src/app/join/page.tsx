import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string; room?: string }> }) {
  const { token = '', room } = await searchParams;
  const valid = /^[a-f0-9]{64}$/i.test(token) && (!room || /^[a-zA-Z0-9_-]{1,64}$/.test(room));
  const query = new URLSearchParams({ token: token.toLowerCase(), ...(room ? { room } : {}) }).toString();
  const user = await getCurrentUser();
  if (valid && user?.role === 'TENANT') redirect('/tenant/join?' + query);
  const callbackUrl = '/join?' + query;
  return <main className="mx-auto max-w-md space-y-5 p-6">
    <h1 className="text-2xl font-bold">Join your boarding house</h1>
    {!valid ? <p role="alert">This invitation is invalid. Ask your landlord for a new link.</p> :
      <Link className="inline-flex rounded-xl bg-primary p-3 text-white" href={'/auth/login?role=TENANT&callbackUrl=' + encodeURIComponent(callbackUrl)}>Sign in as Tenant</Link>}
  </main>;
}
