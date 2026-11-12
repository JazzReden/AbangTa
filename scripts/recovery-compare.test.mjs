import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDump } from './recovery-compare.mjs';
test('restore comparison tolerates only redundant charset spelling in table DDL', () => {
  const a='CREATE TABLE `t` (\n `id` varchar(30) COLLATE utf8mb4_unicode_ci\n) ENGINE=InnoDB;';
  const b=a.replace('COLLATE','CHARACTER SET utf8mb4 COLLATE');
  assert.equal(canonicalDump(a),canonicalDump(b));
  assert.notEqual(canonicalDump(a),canonicalDump(a.replace('varchar(30)','varchar(31)')));
});
test('restore comparison never normalizes row contents or different collations', () => {
  const data="INSERT INTO `t` VALUES ('CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');";
  assert.equal(canonicalDump(data),data);
  const schema='CREATE TABLE `t` (\n `id` varchar(30) COLLATE utf8mb4_unicode_ci\n) ENGINE=InnoDB;';
  assert.notEqual(canonicalDump(schema),canonicalDump(schema.replace('utf8mb4_unicode_ci','utf8mb4_bin')));
});
