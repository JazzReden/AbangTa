'use client';

import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { createMaintenanceRequestAction } from './actions';

const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'WATER', 'ROOM', 'OTHER'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function TenantMaintenanceForm() {
  return (
    <StatefulForm action={async (_state, data) => {
      const result = await createMaintenanceRequestAction({}, data);
      return { ...result, success: result.success ? 'Your request has been submitted. Your landlord will be notified.' : undefined };
    }} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1.5">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required minLength={5} maxLength={200}
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
          required minLength={10} maxLength={2000}
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

      <SubmitButton className="flex min-h-11 w-full items-center justify-center rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">Submit request</SubmitButton>
    </StatefulForm>
  );
}
