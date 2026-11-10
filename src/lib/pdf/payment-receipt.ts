import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { receiptSnapshotSchema, type ReceiptSnapshot } from '@/lib/utils/receipt-data';

let fontBytes: Promise<Buffer> | undefined;
export async function paymentReceiptPdf(raw: ReceiptSnapshot) {
  const receipt = receiptSnapshotSchema.parse(raw);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  fontBytes ??= readFile(path.join(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf'));
  const font = await pdf.embedFont(await fontBytes, { subset: true });
  const characters = new Set(font.getCharacterSet());
  let escaped = false;
  const printable = (value: string) => [...value.replace(/[\x00-\x1f\x7f]/g, ' ')].map(character => {
    const code = character.codePointAt(0)!;
    if (characters.has(code)) return character;
    escaped = true;
    return '[U+' + code.toString(16).toUpperCase() + ']';
  }).join('');
  const date = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
  let page = pdf.addPage([595.28, 841.89]);
  let y = 786;
  const ink = rgb(0.17, 0.15, 0.14), muted = rgb(0.47, 0.43, 0.40), orange = rgb(0.92, 0.38, 0.05);
  function text(value: string, size = 11, color = ink) {
    const lines: string[] = [];
    let line = '';
    for (const character of printable(value)) {
      if (line && font.widthOfTextAtSize(line + character, size) > 491) { lines.push(line.trimEnd()); line = ''; }
      line += character;
    }
    lines.push(line);
    for (const row of lines) {
      if (y < 70) { page = pdf.addPage([595.28, 841.89]); y = 786; }
      page.drawText(row, { x: 52, y, font, size, color });
      y -= size + 7;
    }
  }
  pdf.setTitle('AbangTa payment receipt ' + receipt.number);
  pdf.setAuthor('AbangTa');
  pdf.setCreationDate(new Date(receipt.confirmedAt));
  pdf.setModificationDate(new Date(receipt.confirmedAt));
  text('AbangTa', 25, orange);
  text('PAYMENT RECEIPT', 15);
  text(receipt.number, 9, muted);
  y -= 12;
  text('Received from: ' + receipt.tenantName);
  text('Confirmed by: ' + receipt.landlordName);
  text('Property: ' + receipt.propertyName);
  text('Address: ' + receipt.propertyAddress);
  text('Room: ' + receipt.room);
  text('Billing period: ' + date(receipt.periodStart) + ' - ' + date(receipt.periodEnd));
  y -= 12;
  text('Amount received: PHP ' + receipt.amount, 17, orange);
  text('Payment method: ' + (receipt.method === 'GCASH' ? 'GCash' : 'Cash'));
  text('Payment date: ' + date(receipt.paymentDate));
  text('Confirmed on: ' + date(receipt.confirmedAt));
  text('Transaction reference: ' + (receipt.reference || 'Not provided'));
  y -= 12;
  text('Billed total: PHP ' + receipt.totalBilled);
  text('Total paid at confirmation: PHP ' + receipt.totalPaid);
  text('Balance at confirmation: PHP ' + receipt.balance);
  y -= 16;
  text('Payment acknowledgement issued after landlord confirmation.', 9, muted);
  text('A partial payment does not settle the remaining balance.', 9, muted);
  text('This receipt is no longer valid if the payment is reversed.', 9, muted);
  if (escaped) text('Characters unavailable in this font are preserved as Unicode code points [U+...].', 9, muted);
  return pdf.save();
}
