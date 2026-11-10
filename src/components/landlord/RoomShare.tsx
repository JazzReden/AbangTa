'use client';
import React, { useState } from 'react';
import Image from 'next/image';
import { Copy, Check, Share2, QrCode, Download, Send } from 'lucide-react';

export function RoomShare({ url, qr, propertyName, roomNumber }: { url: string; qr: string; propertyName: string; roomNumber: string }) {
  const [showQr, setShowQr] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [contact, setContact] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const message = `${name.trim() ? 'Hi ' + name.trim() + ',\n\n' : ''}You are invited to ${propertyName}, Room ${roomNumber}.\n${url}`;
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setNotice('Room link copied.'); }
    catch { setNotice('Copy is unavailable in this browser. Use Share or download the QR code.'); }
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: propertyName + ' / Room ' + roomNumber, text: message });
      else await copy();
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setNotice('Unable to share. Copy the room link instead.'); }
  }
  function send(event: React.FormEvent) {
    event.preventDefault();
    const destination = contact.trim();
    if (mode === 'email') {
      if (!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(destination)) { setNotice('Enter a valid email address.'); return; }
      window.location.href = 'mailto:' + encodeURIComponent(destination) + '?subject=' + encodeURIComponent(propertyName + ' room invitation') + '&body=' + encodeURIComponent(message);
    } else {
      const phone = destination.replace(/[\s()-]/g, '');
      if (!/^\+?\d{7,15}$/.test(phone)) { setNotice('Enter a valid mobile number.'); return; }
      window.location.href = 'sms:' + phone + '?body=' + encodeURIComponent(message);
    }
  }
  return <div className="mt-4 space-y-3 border-t pt-4">
    <form onSubmit={send} className="space-y-3">
      <label className="block text-sm font-medium">Name (optional)
        <input value={name} onChange={event => setName(event.target.value)} maxLength={100} autoComplete="off" className="mt-1 block w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm" />
      </label>
      <fieldset><legend className="mb-2 text-sm font-medium">Send to (optional)</legend>
        <div className="mb-2 flex gap-4 text-sm">{(['email', 'phone'] as const).map(value => <label key={value} className="flex items-center gap-2">
          <input type="radio" checked={mode === value} onChange={() => { setMode(value); setContact(''); setNotice(''); }} />{value === 'email' ? 'Email' : 'Mobile'}
        </label>)}</div>
        <div className="flex gap-2"><input aria-label={mode === 'email' ? 'Recipient email' : 'Recipient mobile'} type={mode === 'email' ? 'email' : 'tel'} value={contact}
          onChange={event => setContact(event.target.value)} maxLength={191} placeholder={mode === 'email' ? 'Email address' : 'Mobile number'} className="min-w-0 flex-1 rounded-2xl border border-input bg-background px-3 py-2 text-sm" />
          <button disabled={!contact.trim()} type="submit" title="Open email or SMS app" aria-label="Send room invitation" className="rounded-xl bg-primary p-3 text-white disabled:opacity-40"><Send size={18} /></button>
        </div>
      </fieldset>
    </form>
    <div className="flex flex-wrap gap-2" role="group" aria-label={'Share invitation for Room ' + roomNumber}>
      <button type="button" onClick={copy} title="Copy room link" className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm">{copied ? <Check size={16} /> : <Copy size={16} />} Copy link</button>
      <button type="button" onClick={share} title="Share room invitation" className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white"><Share2 size={16} /> Share</button>
      <button type="button" onClick={() => setShowQr(!showQr)} title="Show room QR code" aria-expanded={showQr} className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm"><QrCode size={16} /> QR code</button>
    </div>
    {showQr && <div className="space-y-2"><Image src={qr} unoptimized width={256} height={256} className="max-w-full" alt={'Join ' + propertyName + ', Room ' + roomNumber} />
      <a href={qr} download={'room-' + roomNumber + '-invitation.png'} className="inline-flex items-center gap-2 text-sm text-primary"><Download size={16} /> Download QR</a>
    </div>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
  </div>;
}
