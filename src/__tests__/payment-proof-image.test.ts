import { File } from 'node:buffer';
import sharp from 'sharp';
import { normalizePaymentProof, MAX_PROOF_BYTES } from '@/lib/security/payment-proof-image';

function file(bytes: Buffer, type = 'image/png') { return new File([bytes], 'proof.png', { type }) as unknown as globalThis.File; }

test('PNG and JPEG uploads become bounded, metadata-free JPEGs', async () => {
  for (const format of ['png', 'jpeg'] as const) {
    const original = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#abcdef' } })[format]().withMetadata().toBuffer();
    const result = await normalizePaymentProof(file(original, 'image/' + format));
    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('jpeg'); expect(metadata.width).toBe(100);
    expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined();
  }
});

test('empty, oversize, active content, spoofed MIME and corrupted images are rejected', async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } }).png().toBuffer();
  for (const bad of [file(Buffer.alloc(0)), file(Buffer.alloc(MAX_PROOF_BYTES + 1)), file(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), file(Buffer.from('%PDF test')), file(png, 'image/jpeg'), file(png.subarray(0, 30))]) {
    await expect(normalizePaymentProof(bad)).rejects.toThrow();
  }
});

test('excessive pixel counts cannot bypass small compressed file limits', async () => {
  const huge = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: '#ffffff' } }).png().toBuffer();
  expect(huge.length).toBeLessThan(MAX_PROOF_BYTES);
  await expect(normalizePaymentProof(file(huge))).rejects.toThrow();
});
