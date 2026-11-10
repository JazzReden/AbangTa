'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, DoorOpen, QrCode, ArrowRight, LoaderCircle } from 'lucide-react';
import jsQR from 'jsqr';
import { previewRoomInvitation, confirmRoomInvitation } from '@/app/tenant/join/actions';
import { parseInvitationInput } from '@/lib/utils/invitation-input';
import { formatPeso } from '@/lib/utils/currency';

type Preview = {
  propertyName: string; address: string; roomNumber: string; monthlyRent: string;
  startDate: string; expiresAt: string; needsApproval: boolean;
  rentalMode?: string; maximumRent?: string;
};
export function RoomJoinForm({ initialInput = '' }: { initialInput?: string }) {
  const router = useRouter();
  const [input, setInput] = useState(initialInput);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmedInput, setConfirmedInput] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setError(''); setNotice(''); setPreview(null);
    setPending(true);
    try {
      const result = await previewRoomInvitation(input);
      if ('error' in result) setError(result.error);
      else { setPreview(result.preview); setConfirmedInput(input); }
    } catch { setError('Unable to preview the invitation. Please try again.'); }
    finally { setPending(false); }
  }
  async function readQr(file?: File) {
    setError(''); setPreview(null);
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a PNG, JPG or WebP QR image under 5 MB.'); return;
    }
    setPending(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('QR images are not supported in this browser.');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
        if (!code) throw new Error('No readable QR code found. Try a clearer image or paste the invitation link.');
        parseInvitationInput(code.data);
        setInput(code.data);
        setNotice('QR invitation read. Review the room before joining.');
      } finally { bitmap.close(); }
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to read QR image'); }
    finally { setPending(false); }
  }

  async function confirm() {
    setError('');
    setPending(true);
    try {
      const result = await confirmRoomInvitation(confirmedInput);
      if ('error' in result) { setError(result.error); return; }
      router.push(result.joined ? '/tenant/dashboard' : '/tenant/dashboard?join=requested');
      router.refresh();
    } catch { setError('Unable to join right now. Please try again.'); }
    finally { setPending(false); }
  }
  return <div className="space-y-5">
    <form onSubmit={lookup} className="space-y-4">
      <label className="block text-sm font-medium">
        Invitation link or code
        <input value={input} disabled={pending} onChange={event => { setInput(event.target.value); setPreview(null); setNotice(''); setError(''); }}
          required maxLength={2048} placeholder="Paste invitation link or ABCD-1234-EF56"
          className="mt-2 block min-h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </label>
      <div className="flex flex-wrap gap-3">
        <button disabled={pending} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white disabled:opacity-60">
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : <DoorOpen size={18} />} Preview room
        </button>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-medium">
          <QrCode size={18} /> Upload QR image
          <input type="file" disabled={pending} accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => { void readQr(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
      </div>
    </form>
    {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {preview && <section className="space-y-4 border-t pt-5">
      <div className="flex items-center gap-3"><Building2 className="text-primary" size={24} /><div><h2 className="text-xl font-bold">{preview.propertyName}</h2><p className="text-sm text-muted-foreground">{preview.address}</p></div></div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Room</dt><dd className="font-semibold">{preview.roomNumber}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{preview.rentalMode === 'PER_BED' ? 'Monthly rent per bed' : 'Monthly rent'}</dt><dd className="font-semibold">{formatPeso(preview.monthlyRent)}{preview.maximumRent && preview.maximumRent !== preview.monthlyRent ? ' to ' + formatPeso(preview.maximumRent) : ''}</dd></div>
      </dl>
      {preview.needsApproval && <p className="text-sm text-muted-foreground">The landlord must approve this account before you can access the room.</p>}
      <button onClick={confirm} disabled={pending} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white disabled:opacity-60">
        <ArrowRight size={18} /> {preview.needsApproval ? 'Request to join' : 'Confirm and join room'}
      </button>
    </section>}
  </div>;
}
