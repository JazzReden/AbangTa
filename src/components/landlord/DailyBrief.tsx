import React from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, ReceiptText, Wrench } from 'lucide-react';
import type { ActionSummary } from '@/services/operations/action-center.service';

export function DailyBrief({ summary }: { summary: ActionSummary }) {
  const total = summary.proofs + summary.overdue + summary.repairs;
  const focus = summary.urgent ? { title: `${summary.urgent} urgent repair${summary.urgent === 1 ? ' needs' : 's need'} attention`, text: 'Start with the reported urgent issues, then work through payment reviews and overdue bills.', href: '/landlord/action-center?filter=repairs&priority=URGENT' }
    : summary.proofs ? { title: 'Turn payment proofs into clear records', text: 'Verify transfers in your GCash account, then confirm or explain what needs correcting.', href: '/landlord/action-center?filter=proofs' }
    : summary.overdue ? { title: 'Follow up with the full picture', text: 'Review the oldest unpaid bills and any submitted proof before sending a reminder.', href: '/landlord/action-center?filter=overdue' }
    : summary.repairs ? { title: 'Keep repairs moving', text: 'Acknowledge new requests and give tenants a useful progress update.', href: '/landlord/action-center?filter=repairs' }
    : { title: 'Your action queues are clear', text: 'No pending GCash proofs, overdue balances, or open repairs right now.', href: '/landlord/action-center' };
  const cards = [
    { label: 'Payment reviews', count: summary.proofs, icon: ReceiptText, filter: 'proofs' },
    { label: 'Overdue bills', count: summary.overdue, icon: Clock3, filter: 'overdue' },
    { label: 'Open repairs', count: summary.repairs, icon: Wrench, filter: 'repairs' },
  ];
  return <section aria-labelledby="daily-brief-title" className="mb-6 overflow-hidden rounded-3xl border border-primary/20 bg-card">
    <div className="flex flex-col gap-5 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <p className="app-eyebrow">Your daily focus · across all properties</p>
        <h2 id="daily-brief-title" className="flex items-start gap-2 font-semibold">{!total && <CheckCircle2 size={21} className="shrink-0 text-green-700" aria-hidden="true" />}{focus.title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{focus.text}</p>
      </div>
      <a href={focus.href} className="app-primary-action shrink-0">Open action center <ArrowUpRight size={18} aria-hidden="true" /></a>
    </div>
    <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {cards.map(card => <a href={`/landlord/action-center?filter=${card.filter}`} key={card.filter} className="flex min-w-0 items-center gap-3 p-5 hover:bg-muted/50">
        <card.icon size={20} className="shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm font-medium">{card.label}</span>
        <span className="text-2xl font-semibold tabular-nums">{card.count}</span>
      </a>)}
    </div>
  </section>;
}
