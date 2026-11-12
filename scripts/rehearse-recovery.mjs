// Disposable local databases only. This never restores over the source database.
import { canonicalDump } from './recovery-compare.mjs';
import { mkdtempSync, writeFileSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

let directory, restoreDatabase, defaultsFile, created = false;
function run(command, args, io = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024, ...io });
  if (result.status !== 0 || result.error) throw new Error(command + ' failed; inspect the database/tool configuration privately.');
  return result.stdout;
}
function mysql(sql, database) {
  return run('mysql', ['--defaults-file=' + defaultsFile, '--batch', '--skip-column-names', ...(database ? [database] : []), '-e', sql]);
}
try {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (process.env.ABANGTA_DB_TESTS !== '1' || url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !/^[a-zA-Z0-9_]{1,40}_test$/.test(database)) throw new Error('Use ABANGTA_DB_TESTS=1 and a disposable loopback MySQL database ending in _test.');
  directory = mkdtempSync(join(tmpdir(), 'abangta-recovery-'));
  const option = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r') + '"';
  defaultsFile = join(directory, 'mysql.cnf');
  writeFileSync(defaultsFile, `[client]\nhost=${option(url.hostname)}\nport=${Number(url.port || 3306)}\nuser=${option(decodeURIComponent(url.username))}\npassword=${option(decodeURIComponent(url.password))}\nprotocol=tcp\n`, { mode: 0o600 });
  restoreDatabase = database + '_restore_' + randomBytes(4).toString('hex');
  const dumpArgs = ['--defaults-file=' + defaultsFile, '--single-transaction', '--quick', '--no-tablespaces', '--set-gtid-purged=OFF', '--skip-comments', '--skip-dump-date', '--hex-blob', '--order-by-primary'];
  function dump(name, file) {
    const fd = openSync(file, 'wx', 0o600);
    try { run('mysqldump', [...dumpArgs, name], { stdio: ['ignore', fd, 'pipe'] }); } finally { closeSync(fd); }
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  }
  const backup = join(directory, 'backup.sql');
  const before = dump(database, backup);
  // CREATE fails on any name collision; never DROP/overwrite an existing database.
  mysql('CREATE DATABASE `' + restoreDatabase + '`'); created = true;
  const fd = openSync(backup, 'r');
  try { run('mysql', ['--defaults-file=' + defaultsFile, restoreDatabase], { stdio: [fd, 'ignore', 'pipe'] }); } finally { closeSync(fd); }
  const after = dump(restoreDatabase, join(directory, 'restored.sql'));
  const digest = file => createHash('sha256').update(canonicalDump(readFileSync(file, 'utf8'))).digest('hex');
  const canonicalBefore = digest(backup), canonicalAfter = digest(join(directory, 'restored.sql'));
  if (canonicalBefore !== canonicalAfter) throw new Error('Restored schema/data dump differs from the backup. Keep the rehearsal failed.');
  const tables = Number(mysql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()', restoreDatabase).trim());
  console.log(JSON.stringify({ ok: true, event: 'recovery.restore-verified', tables, backupSha256: before, restoredSha256: after, verifiedSchemaDataSha256: canonicalAfter, comparison: 'DDL charset spelling normalized; row data exact', restoreDatabase: process.env.ABANGTA_RECOVERY_KEEP === '1' ? restoreDatabase : undefined }));
} catch (error) {
  console.error(error instanceof Error && !error.message.includes('mysql://') ? error.message : 'Recovery rehearsal failed.'); process.exitCode = 1;
} finally {
  if (created && (process.env.ABANGTA_RECOVERY_KEEP !== '1' || process.exitCode)) {
    try { mysql('DROP DATABASE `' + restoreDatabase + '`'); } catch { console.error('Unable to remove the rehearsal database; review local cleanup.'); process.exitCode = 1; }
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
}
