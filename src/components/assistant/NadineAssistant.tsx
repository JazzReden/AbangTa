'use client';

import Image from 'next/image';
import React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, X, Minus, RefreshCw, CalendarClock, MessageCircle } from 'lucide-react';
import styles from './NadineAssistant.module.css';
import type { AssistantAnswer } from '@/lib/assistant/contracts';
import { ReminderComposer, nadineRequest } from './ReminderComposer';
import { useNadinePosition } from './useNadinePosition';
import { conversationAnswer, ishiWelcome, isTenantReport } from '@/lib/assistant/conversation';
import { startTenantAnswerRefresh } from '@/lib/assistant/tenant-answer-refresh';
import { tenantPlanSchema } from '@/lib/assistant/tenant-contracts';

type Turn = { question: string; answer: AssistantAnswer; propertyId?: string };
type Delivery = { id: string; status: string; scheduledAt: string | null; outcome: string | null; bill: { tenancy: { tenant: { name: string } } } };
const suggestions = [
  ['Unpaid this month', 'Who has unpaid rent this month?'], ['Available rooms/beds', 'Which rooms are available?'],
  ['Collections this week', 'How much did I collect this week?'], ['Open maintenance', 'Summarize my maintenance requests.'],
];
const tenantSuggestions = [
  ['My bills', 'Show my bills'], ['My payments', 'Show my payments'],
  ['My room', 'Show my assigned room'], ['My maintenance', 'Show my maintenance requests'],
];

export function NadineAssistant({ properties, contextKey, positionKey, audience = 'landlord' }: { properties: Array<{ id: string; name: string }>; contextKey: string; positionKey?: string; audience?: 'landlord' | 'tenant' }) {
  const tenant = audience === 'tenant';
  const [open, setOpen] = useState(false), [question, setQuestion] = useState(''), [propertyId, setPropertyId] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const floating = useNadinePosition(() => setOpen(false), positionKey);
  const input = useRef<HTMLInputElement>(null), launcher = useRef<HTMLButtonElement>(null), scroll = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null), latest = useRef<Turn | undefined>(undefined), lastCheck = useRef(0), active = useRef(false);
  const previousContext = useRef(contextKey), needsRefresh = useRef(false);
  const currentTurns = useRef(turns), skipAutoScroll = useRef(false);
  currentTurns.current = turns;
  const requestMode = useRef<'refresh' | 'question' | null>(null);
  const reminderEditing = useRef(false);
  const setReminderEditing = useCallback((editing: boolean) => { reminderEditing.current = editing; }, []);
  latest.current = turns.filter(turn => turn.answer.source !== 'Conversation').at(-1); active.current = open;

  async function ask(text: string, refresh = false) {
    if (!text.trim()) return;
    if (controller.current) {
      if (refresh || requestMode.current !== 'refresh') return;
      controller.current.abort();
    }
    const greeting = !refresh && conversationAnswer(text, audience);
    if (greeting) {
      controller.current = null; requestMode.current = null; setBusy(false); setError(''); setQuestion('');
      setTurns(old => [...old.slice(-5), { question: text, answer: greeting }]); return;
    }
    const prior = latest.current;
    const scope = refresh ? prior?.propertyId : propertyId || undefined;
    const request = new AbortController(); controller.current = request; requestMode.current = refresh ? 'refresh' : 'question';
    setBusy(!refresh); setError(''); lastCheck.current = Date.now();
    const timeout = setTimeout(() => request.abort(), 20000);
    try {
      const answer: AssistantAnswer = await nadineRequest(tenant ? '/api/tenant/assistant/chat' : '/api/assistant/chat', { question: text, ...(!tenant ? { propertyId: scope } : {}), ...(!refresh && prior && prior.propertyId === scope ? { previousPlan: prior.answer.plan } : {}), ...(refresh && prior ? { refreshPlan: prior.answer.plan } : {}) }, request.signal);
      if (request.signal.aborted) return;
      setTurns(old => refresh ? old.map(turn => turn === prior ? { question: text, answer, propertyId: scope } : turn) : [...old.slice(-5), { question: text, answer, propertyId: scope }]);
      if (!refresh) setQuestion(''); setDeliveries(null);
    } catch (cause) {
      if (controller.current === request && !request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Ishi is unavailable.');
      else if (controller.current === request && !refresh) setError('The request timed out. Please try again.');
    }
    finally { clearTimeout(timeout); if (controller.current === request) { controller.current = null; requestMode.current = null; setBusy(false); } }
  }
  useEffect(() => () => controller.current?.abort(), []);
  const hasTenantReports = tenant && turns.some(turn => isTenantReport(turn.answer.plan.topic));
  useEffect(() => {
    if (!tenant || !open || !hasTenantReports) return;
    return startTenantAnswerRefresh({
      snapshot: () => {
        if (controller.current) return null;
        const reports = currentTurns.current.filter(turn => isTenantReport(turn.answer.plan.topic));
        if (!reports.length) return null;
        return { plans: reports.map(turn => tenantPlanSchema.parse(turn.answer.plan)), apply: answers => {
          skipAutoScroll.current = true;
          setTurns(old => old.map(turn => { const index = reports.indexOf(turn); return index < 0 ? turn : { ...turn, answer: answers[index] }; }));
        } };
      },
      denied: () => { setTurns([]); setError('Please sign in again to check your tenant records.'); },
    });
  }, [tenant, open, hasTenantReports]);
  useEffect(() => {
    if (open) input.current?.focus();
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); launcher.current?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  useEffect(() => {
    if (previousContext.current !== contextKey) { needsRefresh.current = true; previousContext.current = contextKey; }
    if (open && !busy && !reminderEditing.current && latest.current && (needsRefresh.current || Date.now() - lastCheck.current > 15000)) {
      needsRefresh.current = false;
      void ask(latest.current.question, true);
    }
    // New dashboard totals/proof revisions invalidate the last answer without another AI call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contextKey, busy]);
  useEffect(() => {
    const refresh = () => { if (active.current && !reminderEditing.current && document.visibilityState === 'visible' && latest.current && Date.now() - lastCheck.current > 15000) void ask(latest.current.question, true); };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (skipAutoScroll.current) { skipAutoScroll.current = false; return; }
    const area = scroll.current;
    if (!area) return;
    const newest = area.querySelector('article:last-of-type');
    if (busy || !newest) area.scrollTop = area.scrollHeight;
    else area.scrollTop += newest.getBoundingClientRect().top - area.getBoundingClientRect().top;
  }, [turns, busy]);
  function close() { setOpen(false); launcher.current?.focus(); }
  async function schedules() {
    try { setDeliveries(await nadineRequest('/api/assistant/reminders')); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load delivery history.'); }
  }
  async function cancel(id: string) {
    try { await nadineRequest('/api/assistant/reminders', { operation: 'cancel', id }); await schedules(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to cancel.'); }
  }
  const content = <aside ref={floating.root} style={floating.style} aria-label="Ishi assistant" className={`pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-[60] h-20 w-14 sm:h-24 sm:w-16 lg:bottom-5 [@media(max-height:500px)]:h-16 [@media(max-height:500px)]:w-20`}>
    {open && <section role="dialog" aria-labelledby="nadine-title" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}
      style={floating.panelStyle} className="ishi-mobile-panel pointer-events-auto fixed flex max-h-[min(36rem,calc(100dvh-2rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-white shadow-lg">
      <header className="flex shrink-0 items-center gap-2 border-b border-border p-3">
        <Image src="/assistant/nadine.png" width={32} height={40} alt="" className="h-10 w-8 shrink-0 rounded-lg object-cover object-[center_15%]" />
        <div className="min-w-0 flex-1"><h2 id="nadine-title" className="text-sm font-semibold">Ishi — AbangTa Assistant</h2><p className="text-xs text-muted-foreground">{tenant ? 'Your tenant records' : 'Landlord records'}</p></div>
        <button onClick={close} aria-label="Minimize Ishi" title="Minimize" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-background"><Minus size={17} /></button>
        <button onClick={close} aria-label="Close Ishi" title="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-background"><X size={17} /></button>
      </header>
      {!tenant && <div className="shrink-0 border-b border-border p-3 [@media(max-height:500px)]:hidden"><label className="text-xs font-medium">Property scope<select disabled={busy} value={propertyId} onChange={event => { setPropertyId(event.target.value); setTurns([]); setDeliveries(null); }} className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-background p-2 text-sm"><option value="">All my active properties</option>{properties.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label></div>}
      <div ref={scroll} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        {!turns.length && <><p className="text-sm">{ishiWelcome()}</p><div className="grid grid-cols-2 gap-2">{(tenant ? tenantSuggestions : suggestions).map(([label, text]) => <button disabled={busy} key={label} onClick={() => ask(text)} className="rounded-lg border border-border p-2 text-left text-xs font-medium hover:bg-background disabled:opacity-50">{label}</button>)}</div></>}
        {turns.map((turn, index) => <article key={index} className="space-y-2 text-sm">
          <p className="break-words border-l-2 border-primary pl-2 font-medium">{turn.question}</p>
          <p className="whitespace-pre-wrap break-words">{turn.answer.text}</p>
          <p className="break-words text-xs text-muted-foreground">{turn.answer.scope}<br />{turn.answer.range}<br />As of {turn.answer.asOf}<br />{turn.answer.source}</p>
          {turn.answer.records.length > 0 && <ul className="divide-y divide-border">{turn.answer.records.map((record, i) => <li key={i} className="py-2"><Link href={record.href} onClick={close} className="break-words font-medium text-primary hover:underline">{record.label}</Link><p className="break-words text-xs text-muted-foreground">{record.detail}</p></li>)}</ul>}
          {!tenant && index === turns.length - 1 && <ReminderComposer key={turn.answer.asOf + turn.question} records={turn.answer.records} onEditing={setReminderEditing} onDelivered={() => { if (latest.current) void ask(latest.current.question, true); }} />}
        </article>)}
        {!tenant && deliveries && <section className="space-y-3 border-t border-border pt-3 text-sm"><h3 className="font-semibold">Reminder deliveries</h3>{!deliveries.length && <p>No scheduled reminders or delivery outcomes yet.</p>}{deliveries.map(d => <div key={d.id} className="space-y-1 border-b border-border pb-2"><p className="break-words font-medium">{d.bill.tenancy.tenant.name}: {d.status}</p>{d.scheduledAt && <p className="text-xs">{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d.scheduledAt))} (Asia/Manila)</p>}<p className="text-xs text-muted-foreground">{d.outcome}</p>{d.status === 'SCHEDULED' && <button onClick={() => cancel(d.id)} className="rounded-lg border px-3 py-2 text-xs">Cancel schedule</button>}</div>)}</section>}
        {busy && <p role="status" className="text-xs text-muted-foreground">Checking your records...</p>}
        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      </div>
      <form className="shrink-0 space-y-2 border-t border-border p-3" onSubmit={event => { event.preventDefault(); void ask(question); }}>
        <div className="flex gap-2"><label className="sr-only" htmlFor="nadine-question">Ask Ishi</label><input ref={input} id="nadine-question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={500} disabled={busy} placeholder={tenant ? 'Ask about your bills or room...' : 'Ask about your properties...'} className="min-w-0 flex-1 rounded-lg border border-border bg-background p-2 text-sm" /><button type="submit" disabled={busy || !question.trim()} aria-label="Send question" title="Send question" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"><Send size={17} /></button></div>
        <div className="flex items-center justify-between [@media(max-height:500px)]:hidden"><button type="button" disabled={busy || !turns.length} onClick={() => latest.current && ask(latest.current.question, true)} title="Refresh verified records" aria-label="Refresh verified records" className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-background disabled:opacity-50"><RefreshCw size={15} /></button>{!tenant && <button type="button" onClick={schedules} className="inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><CalendarClock size={15} />Reminder deliveries</button>}</div>
      </form>
    </section>}
    <button ref={launcher} aria-label="Open Ishi — AbangTa Assistant" title="Ishi — AbangTa Assistant. Drag to either side; arrow keys reposition." aria-expanded={open} data-paused={floating.dragging} onPointerDown={floating.pointerDown} onPointerMove={floating.pointerMove} onPointerUp={floating.pointerEnd} onPointerCancel={floating.pointerEnd} onLostPointerCapture={floating.pointerEnd} onKeyDown={floating.keyboardMove} onClick={() => { if (!floating.consumeDrag()) setOpen(value => !value); }} className={`${styles.launcher} pointer-events-auto relative block h-20 w-14 sm:h-24 sm:w-16 cursor-grab touch-none select-none rounded-lg active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary`}>
      <span aria-hidden="true" className={styles.motion}><span className={styles.sprite} /></span>
      <MessageCircle size={17} className="absolute bottom-1 right-0 rounded-full bg-primary p-0.5 text-primary-foreground" aria-hidden="true" />
    </button>
  </aside>;
  // Escape dashboard/sidebar stacking contexts without changing their layout or colors.
  return mounted ? createPortal(content, document.body) : content;
}
