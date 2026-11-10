import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireTenant } from '@/lib/auth/session';
import { RoomJoinForm } from '@/components/tenant/RoomJoinForm';

export const metadata = { title: 'Join a Room' };
export default async function TenantJoinPage({ searchParams }: { searchParams: Promise<{ token?: string; room?: string }> }) {
  await requireTenant();
  const { token, room } = await searchParams;
  const initialInput = room && token ? '/join?' + new URLSearchParams({ room, token }).toString() : token ?? '';
  return <main className="mx-auto max-w-2xl p-4 pb-28 md:p-6">
    <Link href="/tenant/dashboard" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16} /> Dashboard</Link>
    <h1 className="mb-2 text-2xl font-bold">Join a room</h1>
    <p className="mb-6 text-sm text-muted-foreground">Use the invitation your landlord shared with you.</p>
    <RoomJoinForm initialInput={initialInput} />
  </main>;
}
