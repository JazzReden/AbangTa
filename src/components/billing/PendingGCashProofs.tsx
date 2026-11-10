import React from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, ReceiptText } from 'lucide-react';
import type { PaymentProofService } from '@/services/billing/payment-proof.service';
import { formatPeso } from '@/lib/utils/currency';
import { formatDateMed } from '@/lib/utils/dates';

type Queue = Awaited<ReturnType<typeof PaymentProofService.getPendingForLandlord>>;

export function PendingGCashProofs({ queue }: { queue: Queue }) {
  return <section id="pending-gcash-proofs" aria-labelledby="pending-gcash-title" className="mb-6 border-y border-border py-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 id="pending-gcash-title" className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <ReceiptText size={16} className="shrink-0 text-primary" aria-hidden="true" />
        GCash proofs awaiting review
      </h2>
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{queue.total} pending</span>
    </div>
    {!queue.proofs.length ? <p className="text-sm text-muted-foreground">No GCash proofs awaiting review.</p> : <ul className="divide-y divide-border">
      {queue.proofs.map(proof => <li key={proof.id} className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1 break-words">
          <h3 className="text-sm font-semibold">{proof.bill.tenancy.tenant.name}</h3>
          <p className="text-sm text-muted-foreground">{proof.bill.property.name} / Room {proof.bill.tenancy.room.roomNumber}{proof.bill.tenancy.bed ? ` / ${proof.bill.tenancy.bed.label}` : ''}</p>
          <p className="text-xs text-muted-foreground">Submitted {formatDateMed(proof.createdAt)}</p>
          {(proof.bill.cancelledAt || proof.bill.status === 'CANCELLED') ? <p className="text-xs text-muted-foreground">Bill cancelled - proof still needs review.</p> : proof.bill.status === 'PAID' ? <p className="text-xs text-muted-foreground">Bill already paid - check for duplicate payment.</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 sm:justify-end">
          <p className="whitespace-nowrap text-sm font-semibold">{formatPeso(proof.amount)}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">Submitted amount</span></p>
          <Link href={`/landlord/properties/${proof.bill.propertyId}/bills/${proof.billId}#proof-${proof.id}`}
            aria-label={`Review proof for ${proof.bill.tenancy.tenant.name}, ${proof.bill.property.name}, room ${proof.bill.tenancy.room.roomNumber}`}
            className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary hover:underline">
            Review proof<ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </li>)}
    </ul>}
    {queue.pages > 1 && <nav aria-label="Pending GCash proof pages" className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
      <p className="text-muted-foreground">Page {queue.page} of {queue.pages}</p>
      <div className="flex gap-2">
        {queue.page > 1 && <Link href={`/landlord/dashboard?proofPage=${queue.page - 1}#pending-gcash-proofs`} aria-label="Previous proofs" title="Previous proofs" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border"><ChevronLeft size={18} aria-hidden="true" /></Link>}
        {queue.page < queue.pages && <Link href={`/landlord/dashboard?proofPage=${queue.page + 1}#pending-gcash-proofs`} aria-label="Next proofs" title="Next proofs" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border"><ChevronRight size={18} aria-hidden="true" /></Link>}
      </div>
    </nav>}
  </section>;
}
