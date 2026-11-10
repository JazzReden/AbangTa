import { normalizeIdentifier, passwordAccountSchema } from '@/lib/auth/credentials';
import { accountFlowError } from '@/lib/auth/intent';

test('email identifiers are normalized', () => {
  expect(normalizeIdentifier(' USER@Example.com ')).toEqual({ email: 'user@example.com', mobile: null });
});
test('Philippine mobile formats resolve to one unique login identifier', () => {
  for (const value of ['0917 123 4567', '+63 917 123 4567', '639171234567', '9171234567']) {
    expect(normalizeIdentifier(value)).toEqual({ email: null, mobile: '+639171234567' });
  }
});
test('invalid identifiers are rejected', () => {
  for (const value of ['123', 'not-an-email', '+12025550123', '0917123456', 'email@']) {
    expect(() => normalizeIdentifier(value)).toThrow();
  }
});
test('registration validates name, role and password without truncating bcrypt inputs', () => {
  const valid = { name: 'Test User', identifier: 'test@example.com', password: 'StrongPassword123', role: 'TENANT' };
  expect(passwordAccountSchema.safeParse(valid).success).toBe(true);
  expect(passwordAccountSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  expect(passwordAccountSchema.safeParse({ ...valid, password: 'a'.repeat(73) }).success).toBe(false);
  expect(passwordAccountSchema.safeParse({ ...valid, password: 'é'.repeat(40) }).success).toBe(false);
  expect(passwordAccountSchema.safeParse({ ...valid, role: 'ADMIN' }).success).toBe(false);
});
test('Google cannot claim a password account without proof of its existing session', () => {
  const intent = { role: 'LANDLORD' as const, mode: 'signin' as const, returnTo: '/onboarding', expiresAt: Date.now() + 60000 };
  const account = { id: 'owner', role: 'LANDLORD' as const, googleSubject: null, passwordHash: '$2a$12$existinghash' };
  expect(accountFlowError(intent, account, 'subject')).toBe('password-first');
  expect(accountFlowError({ ...intent, linkUserId: 'another-user' }, account, 'subject')).toBe('password-first');
  expect(accountFlowError({ ...intent, linkUserId: 'owner' }, account, 'subject')).toBeNull();
});
