'use client';

import { createContext, startTransition, useActionState, useContext } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionError } from './ActionError';
import Image from 'next/image';

type FormState = { error?: string; success?: string; invitationUrl?: string; qrCode?: string; invitationCode?: string };
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
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <ActionPending.Provider value={pending}>
    <form action={formAction} onSubmit={preserveValues ? event => {
      // Manual action dispatch avoids React's automatic native reset of controlled selects.
      event.preventDefault();
      if (pending) return;
      const data = new FormData(event.currentTarget);
      startTransition(() => formAction(data));
    } : undefined} className={className}>
      <ActionError message={state.error} />
      {state.success ? (
        <div className="mb-3 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">
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
