import { createHash, timingSafeEqual } from 'node:crypto';

export function validJobAuthorization(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header || header.length > 512) return false;
  return timingSafeEqual(createHash('sha256').update(header).digest(), createHash('sha256').update('Bearer ' + secret).digest());
}
