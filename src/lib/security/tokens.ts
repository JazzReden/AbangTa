import { createHash, randomBytes } from 'node:crypto';

export function invitationToken() {
  const token = randomBytes(32).toString('hex');
  return { token, digest: tokenDigest(token) };
}

export function tokenDigest(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid invitation link');
  return createHash('sha256').update(token).digest('hex');
}
