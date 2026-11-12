'use client';

import { CircleAlert } from 'lucide-react';
import { EmptyState } from './EmptyState';

export function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-6xl p-4 md:p-6">
      <EmptyState
        icon={<CircleAlert size={24} aria-hidden="true" />}
        title="We couldn’t load this page"
        description="Try again to reload the page."
        action={<button className="app-primary-action" onClick={reset}>Try again</button>}
      />
    </div>
  );
}
