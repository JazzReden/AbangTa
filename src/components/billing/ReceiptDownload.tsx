import React from 'react';
import { Download } from 'lucide-react';
import { hasDownloadableReceipt } from '@/lib/utils/receipt-data';

export function ReceiptDownload({ payment }: { payment: { id: string; paymentMethod: string; confirmedAt?: Date | null; voidedAt?: Date | null } }) {
  if (!hasDownloadableReceipt(payment)) return null;
  return <a href={`/api/payments/${payment.id}/receipt`} download title="Download confirmed payment receipt (PDF)" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><Download size={16} aria-hidden="true" />Receipt</a>;
}
