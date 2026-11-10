'use client';

import { useEffect, useState } from 'react';
import React from 'react';
import { Send, CalendarClock } from 'lucide-react';
import type { AssistantRecord } from '@/lib/assistant/contracts';

export async function nadineRequest(path: string, body?: unknown, signal?: AbortSignal) {
  if (!navigator.onLine) throw new Error('You are offline. Reconnect and try again.');
  const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Nadine is unavailable. Please try again.');
  return result;
}

type Preview = { id: string; message: string; template: string; pendingProof: boolean };
export function ReminderComposer({ records, onDelivered, onEditing }: { records: AssistantRecord[]; onDelivered: () => void; onEditing: (editing: boolean) => void }) {
  const bills = records.filter(r => r.billId);
  const [billId, setBillId] = useState(bills[0]?.billId ?? '');
  const [language, setLanguage] = useState('en');
  const [template, setTemplate] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false), [enabled, setEnabled] = useState(false), [time, setTime] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const field = 'mt-1 block w-full min-w-0 rounded-lg border border-border bg-background p-2 text-sm';
  useEffect(() => () => onEditing(false), [onEditing]);
  function reset() { setPreview(null); setConfirmed(false); setEnabled(false); setTime(''); setNotice(''); }
  async function act(operation: 'preview' | 'send' | 'schedule') {
    onEditing(true);
    setBusy(true); setNotice('');
    try {
      const payload = operation === 'preview' ? { operation, billId, language, ...(template ? { template } : {}) } : operation === 'send' ? { operation, id: preview?.id, confirmed } : { operation, id: preview?.id, scheduledAt: new Date(time + ':00+08:00').toISOString(), enabled };
      const result = await nadineRequest('/api/assistant/reminders', payload);
      if (operation === 'preview') { setPreview(result); setTemplate(result.template); setConfirmed(false); setEnabled(false); setTime(''); }
      else { setNotice(result.reason); setPreview(null); setConfirmed(false); onEditing(false); onDelivered(); }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to complete the reminder.'); }
    finally { setBusy(false); }
  }
  if (!bills.length) return null;
  return <section aria-label="Reminder preview" className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
    <h3 className="font-semibold">Payment reminder</h3>
    <label className="block">Recipient / bill<select disabled={busy} className={field} value={billId} onChange={e => { onEditing(true); setBillId(e.target.value); setTemplate(''); reset(); }}>{bills.map(b => <option key={b.billId} value={b.billId}>{b.label} - {b.detail}</option>)}</select></label>
    <label className="block">Language<select disabled={busy} className={field} value={language} onChange={e => { onEditing(true); setLanguage(e.target.value); setTemplate(''); reset(); }}><option value="en">English</option><option value="ceb">Cebuano</option></select></label>
    {template && <label className="block">Reminder wording<textarea disabled={busy} className={field} rows={4} maxLength={1000} value={template} onChange={e => { setTemplate(e.target.value); reset(); }} /><span className="text-xs text-muted-foreground">Keep {'{tenant}'}, {'{balance}'} and {'{due}'} for verified details.</span></label>}
    <button disabled={busy} onClick={() => act('preview')} className="rounded-lg border border-border px-3 py-2 font-medium disabled:opacity-50">{busy ? 'Working...' : 'Preview reminder'}</button>
    {preview && <>
      <p className="whitespace-pre-wrap break-words border-l-2 border-primary pl-3">{preview.message}</p>
      {preview.pendingProof ? <p role="status" className="text-muted-foreground">GCash proof is awaiting review. Confirm or decline it before sending a reminder.</p> : <>
        <label className="flex items-start gap-2"><input className="mt-1 accent-primary" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked the recipient and message. Send through AbangTa only.</label>
        <button disabled={busy || !confirmed} onClick={() => act('send')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50"><Send size={15} aria-hidden="true" />Send now</button>
        <details className="border-t border-border pt-2"><summary className="cursor-pointer font-medium">Schedule delivery</summary><div className="mt-3 space-y-3">
          <label className="block">Delivery time (Asia/Manila)<input className={field} type="datetime-local" value={time} onChange={e => setTime(e.target.value)} /></label>
          <label className="flex items-start gap-2"><input className="mt-1 accent-primary" type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Enable one scheduled reminder for this recipient at this time.</label>
          <button disabled={busy || !enabled || !time || !confirmed} onClick={() => act('schedule')} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 disabled:opacity-50"><CalendarClock size={15} aria-hidden="true" />Schedule reminder</button>
          <p className="text-xs text-muted-foreground">In-app delivery is checked every five minutes while the server scheduler is running.</p>
        </div></details>
      </>}
    </>}
    {notice && <p role="status" className="break-words text-sm text-muted-foreground">{notice}</p>}
  </section>;
}
