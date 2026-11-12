import { listHref, listQuery, pageWindow } from '@/lib/lists/query';
import { validationError } from '@/lib/actions/form';
test('query normalization bounds untrusted input and clamps empty/stale pages', () => {
  expect(listQuery({ page: ['1', '2'], q: ' x '.repeat(100), month: '2026-13' })).toMatchObject({ page: 1, month: '' });
  expect(listQuery({ q: 'x'.repeat(1000) }).q).toHaveLength(100);
  for (const page of ['0', '-1', 'NaN', 'Infinity', '1.5', '9007199254740992']) expect(listQuery({ page }).page).toBe(1);
  expect(pageWindow(0, 5)).toMatchObject({ page: 1, pages: 1, skip: 0 });
  expect(pageWindow(25, 100000)).toMatchObject({ page: 3, pages: 3, skip: 24 });
});
test('pagination preserves and safely encodes filters and drops old page number', () => {
  const url = listHref('/tenant/bills', { q: 'Room & <script>', status: 'OVERDUE', month: '2026-10', page: '99' } as any, 2);
  const parsed = new URL(url, 'https://example.test');
  expect(parsed.searchParams.get('q')).toBe('Room & <script>'); expect(parsed.searchParams.get('page')).toBe('2');
  expect(parsed.searchParams.get('status')).toBe('OVERDUE'); expect(parsed.searchParams.get('month')).toBe('2026-10');
});
test('validation errors retain the first actionable message per field without prototype mutation', () => {
  const result = validationError([{ path: ['amount'], message: 'Enter a positive amount' }, { path: ['amount'], message: 'Other error' }, { path: ['__proto__'], message: 'Safe' }]);
  expect(result.fieldErrors.amount).toBe('Enter a positive amount'); expect(Object.getPrototypeOf(result.fieldErrors)).toBe(Object.prototype);
});
