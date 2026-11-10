import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <header className="app-page-header">
    <div className="min-w-0">
      {eyebrow && <p className="app-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p className="app-page-description">{description}</p>}
    </div>
    {action && <div className="app-page-action">{action}</div>}
  </header>;
}
