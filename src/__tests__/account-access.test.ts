import { accountFlowError, readAuthIntent, safeReturnTo, signAuthIntent } from '@/lib/auth/intent';
import type { AuthIntent } from '@/lib/auth/intent';

const secret = 'test-only-auth-intent-secret';
const now = 100000;
const intent: AuthIntent = { role: 'LANDLORD', mode: 'register', returnTo: '/onboarding', expiresAt: now + 60000 };

test('new users must register; sign-in does not silently create accounts', () => {
  expect(accountFlowError({ ...intent, mode: 'signin' }, null, 'google-id')).toBe('create-account');
  expect(accountFlowError(intent, null, 'google-id')).toBeNull();
});

test('selected portal cannot change an existing account role', () => {
  expect(accountFlowError(intent, { role: 'TENANT', googleSubject: 'google-id' }, 'google-id')).toBe('wrong-role');
  expect(accountFlowError({ ...intent, mode: 'signin' }, { role: 'LANDLORD', googleSubject: 'google-id' }, 'google-id')).toBeNull();
});

test('registered users sign in instead of creating duplicate accounts', () => {
  expect(accountFlowError(intent, { role: 'LANDLORD', googleSubject: 'google-id' }, 'google-id')).toBe('account-exists');
});

test('an invitation-created tenant record can activate through either tenant flow', () => {
  const tenant = { role: 'TENANT' as const, googleSubject: null };
  expect(accountFlowError({ ...intent, role: 'TENANT' }, tenant, 'google-id')).toBeNull();
  expect(accountFlowError({ ...intent, role: 'TENANT', mode: 'signin' }, tenant, 'google-id')).toBeNull();
});

test('a different Google identity cannot replace a linked identity', () => {
  expect(accountFlowError({ ...intent, mode: 'signin' }, { role: 'LANDLORD', googleSubject: 'original-id' }, 'different-id')).toBe('identity-mismatch');
});

test('authentication intent survives the OAuth round trip with its role and mode', () => {
  const encoded = signAuthIntent(intent, secret);
  expect(readAuthIntent(encoded, secret, now)).toEqual(intent);
});

test('tampered, expired and incorrectly signed cookies are rejected', () => {
  const encoded = signAuthIntent(intent, secret);
  const [payload, signature] = encoded.split('.');
  const changed = Buffer.from(JSON.stringify({ ...intent, role: 'TENANT' })).toString('base64url');
  expect(readAuthIntent(changed + '.' + signature, secret, now)).toBeNull();
  expect(readAuthIntent(payload + '.invalid', secret, now)).toBeNull();
  expect(readAuthIntent(encoded, 'different-secret', now)).toBeNull();
  expect(readAuthIntent(encoded, secret, intent.expiresAt)).toBeNull();
  expect(readAuthIntent(undefined, secret, now)).toBeNull();
});

test('only valid local invitation redirects are preserved', () => {
  const invitation = '/join?token=' + 'a'.repeat(64);
  expect(safeReturnTo(invitation)).toBe(invitation);
  expect(readAuthIntent(signAuthIntent({ ...intent, returnTo: invitation }, secret), secret, now)?.returnTo).toBe(invitation);
  for (const value of ['https://attacker.example', '//attacker.example', '/join?token=invalid', '/landlord/dashboard']) {
    expect(safeReturnTo(value)).toBe('/onboarding');
  }
});
