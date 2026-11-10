import sharp from 'sharp';

export const MAX_PROOF_BYTES = 4 * 1024 * 1024;

export async function normalizePaymentProof(file: File): Promise<Buffer> {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_PROOF_BYTES) throw new Error('Choose a JPG or PNG screenshot up to 4 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (bytes.length !== file.size || (!png && !jpeg) || file.type !== (png ? 'image/png' : 'image/jpeg')) throw new Error('Choose a valid JPG or PNG screenshot.');
  try {
    const image = sharp(bytes, { limitInputPixels: 12000000, failOn: 'warning' }).timeout({ seconds: 3 });
    const metadata = await image.metadata();
    if (!['png', 'jpeg'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error('Invalid image');
    // Re-encoding removes embedded metadata and active/trailing content. Never serve original uploads.
    const normalized = await image.rotate().resize({ width: 1800, height: 3000, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
    if (normalized.length > 900 * 1024) throw new Error('Image too large');
    return normalized;
  } catch { throw new Error('The screenshot could not be read. Choose a smaller, valid JPG or PNG.'); }
}
