'use client';

import { useActionState } from 'react';
import { createMaintenanceRequestAction } from './actions';

const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'WATER', 'ROOM', 'OTHER'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const initialState = { error: undefined as string | undefined, success: false };

export default function TenantMaintenanceForm() {
  const [state, formAction, isPending] = useActionState(
    createMaintenanceRequestAction,
    initialState
  );

  if (state.success) {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-sm font-medium">
        ✓ Your request has been submitted. Your landlord will be notified.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1.5">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="e.g. Leaking faucet in bathroom"
          className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium mb-1.5">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          required
          placeholder="Please describe the issue in detail…"
          className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring transition resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="category" className="block text-sm font-medium mb-1.5">
            Category
          </label>
          <select
            id="category"
            name="category"
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring transition"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="priority" className="block text-sm font-medium mb-1.5">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring transition"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state?.error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl px-4 py-2.5">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition"
      >
        {isPending && (
          <span className="animate-spin rounded-full border-2 border-white border-t-transparent h-4 w-4" />
        )}
        {isPending ? 'Submitting…' : 'Submit Request'}
      </button>
    </form>
  );
}
