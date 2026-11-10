const braces = require('braces');
const { sprintf } = require('sprintf-js');

test('the dependency tree actually loads the documented security backports', () => {
  expect(require('braces/package.json').version).toBe('3.0.3+abangta.1');
  expect(require('sprintf-js/package.json').version).toBe('1.0.3+abangta.1');
});

test('bounded formatting preserves ordinary tool output', () => {
  expect(sprintf('%s: %04d / %.2f', 'room', 101, 2.5)).toBe('room: 0101 / 2.50');
  expect(sprintf('%(name)s', { name: 'Geo Dorm' })).toBe('Geo Dorm');
});

test.each(['%1000000000s', '%.1000000000s', '%999999999999999999999999999999f'])('rejects unbounded format allocations: %s', format => {
  expect(() => sprintf(format, 'test')).toThrow('safe limit');
});

test('patched brace parser preserves ordinary build patterns', () => {
  expect(braces.expand('src/{app,components}/**/*.{ts,tsx}')).toEqual([
    'src/app/**/*.ts', 'src/app/**/*.tsx', 'src/components/**/*.ts', 'src/components/**/*.tsx',
  ]);
  expect(braces.expand('{1..3}')).toEqual(['1', '2', '3']);
  expect(braces.compile('room-{101,102}')).toBe('room-(101|102)');
});

test.each([
  '{'.repeat(4000) + 'a,b' + '}'.repeat(4000),
  '{'.repeat(4000) + 'a,b',
  '('.repeat(4000) + 'x' + ')'.repeat(4000),
  '{('.repeat(2000) + 'a,b' + ')}'.repeat(2000),
])('rejects excessive input nesting before stack exhaustion', pattern => {
  for (const method of ['parse', 'compile', 'stringify', 'expand']) {
    expect(() => braces[method](pattern)).toThrow(SyntaxError);
    expect(() => braces[method](pattern)).toThrow('safe depth limit');
  }
});

test('guards caller-supplied ASTs as well as text input', () => {
  let node: any = { type: 'text', value: 'x' };
  for (let depth = 0; depth < 500; depth++) node = { type: 'root', nodes: [node] };
  for (const method of ['compile', 'stringify', 'expand']) expect(() => braces[method](node)).toThrow('safe depth limit');
});
