import { LoaderCircle } from 'lucide-react';

export function WorkspaceLoading() {
  return (
    <div role="status" className="mx-auto flex max-w-6xl items-center gap-3 p-6 text-sm text-muted-foreground">
      <LoaderCircle size={18} aria-hidden="true" className="motion-safe:animate-spin" />
      Loading your workspace…
    </div>
  );
}
