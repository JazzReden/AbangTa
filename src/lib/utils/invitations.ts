import { createHash, randomBytes } from 'node:crypto';

export function createInvitationCode() {
  const value = randomBytes(6).toString('hex').toUpperCase();
  return { code: value.match(/.{4}/g)!.join('-'), digest: codeDigest(value) };
}
export function codeDigest(value: string) {
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(code)) throw new Error('Enter a valid invitation code');
  return createHash('sha256').update('code:' + code).digest('hex');
}
