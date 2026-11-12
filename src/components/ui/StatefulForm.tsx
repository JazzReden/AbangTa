'use client';

import { createContext, startTransition, useActionState, useContext, useRef, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';

type FormState = { error?: string; fieldErrors?: Record<string, string>; success?: string; invitationUrl?: string; qrCode?: string; invitationCode?: string };
const ActionPending = createContext(false);

export function StatefulForm({
  action,
  children,
  className,
  preserveValues = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  preserveValues?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const errorId = useId();
  const [state, formAction, pending] = useActionState(async (previous: FormState, data: FormData) => {
    try { return await action(previous, data); }
    catch (error) {
      if (error && typeof error === 'object' && 'digest' in error && String(error.digest).startsWith('NEXT_REDIRECT')) throw error;
      return { error: 'Unable to save right now. Your entries are still here. Please try again.' };
    }
    finally { inFlight.current = false; }
  }, {});
  useEffect(() => {
    if (pending) return;
    if (state.error || Object.keys(state.fieldErrors ?? {}).length) errorRef.current?.focus();
    else if (state.success && !preserveValues) formRef.current?.reset();
    const cleanup: Array<() => void> = [];
    for (const name of Object.keys(state.fieldErrors ?? {})) {
      const control = formRef.current?.elements.namedItem(name);
      if (!(control instanceof HTMLElement)) continue;
      const invalid = control.getAttribute('aria-invalid'), described = control.getAttribute('aria-describedby');
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', [described, errorId + '-' + name].filter(Boolean).join(' '));
      cleanup.push(() => {
        if (invalid === null) control.removeAttribute('aria-invalid'); else control.setAttribute('aria-invalid', invalid);
        if (described === null) control.removeAttribute('aria-describedby'); else control.setAttribute('aria-describedby', described);
      });
    }
    return () => cleanup.forEach(restore => restore());
  }, [state, pending, preserveValues, errorId]);

  return (
    <ActionPending.Provider value={pending}>
    <form ref={formRef} action={formAction} aria-busy={pending} onSubmit={event => {
      // Dispatch explicitly: a returned validation error must not reset inputs.
      event.preventDefault();
      if (inFlight.current || pending) return;
      inFlight.current = true;
      const data = new FormData(event.currentTarget);
      startTransition(() => formAction(data));
    }} className={className}>
      {(state.error || Object.keys(state.fieldErrors ?? {}).length > 0) && <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive focus:outline focus:outline-2">
        <p className="font-semibold">{state.error || 'Check the highlighted fields.'}</p>
        {Object.entries(state.fieldErrors ?? {}).length > 0 && <ul className="mt-2 list-disc space-y-2 pl-4">{Object.entries(state.fieldErrors ?? {}).map(([name, message]) => <li key={name} id={errorId + '-' + name}><button type="button" className="min-h-11 text-left underline" onClick={() => {
          const control = formRef.current?.elements.namedItem(name);
          if (control instanceof HTMLElement) control.focus();
        }}>{message}</button></li>)}</ul>}
      </div>}
      {state.success ? (
        <div role="status" className="mb-3 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">
          {state.success}
        </div>
      ) : null}
      {children}
      {state.invitationUrl && (
        <div className="space-y-3 mt-4">
          {state.invitationCode && <p className="text-sm">Invitation code: <strong className="font-mono">{state.invitationCode}</strong></p>}
          {state.qrCode && <Image src={state.qrCode} unoptimized width={256} height={256} alt="Scan to accept the tenant invitation" />}
          <a href={state.invitationUrl} className="block break-all text-sm underline">{state.invitationUrl}</a>
          <button type="button" onClick={async () => {
            await navigator.clipboard.writeText(state.invitationUrl!);
          }} className="rounded-lg border p-2 text-sm">Copy invitation link</button>
        </div>
      )}
    </form>
    </ActionPending.Provider>
  );
}

export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending: formPending } = useFormStatus();
  const actionPending = useContext(ActionPending);
  const pending = formPending || actionPending;
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? 'Saving…' : children}
    </button>
  );
}
