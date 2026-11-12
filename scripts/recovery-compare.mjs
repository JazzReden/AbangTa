// MySQL 26 may make an implied utf8mb4 charset explicit during restore.
// Normalize only that redundant DDL spelling; never touch INSERT data.
export function canonicalDump(sql) {
  let table = false;
  return sql.split('\n').map(line => {
    if (line.startsWith('CREATE TABLE `')) table = true;
    const normalized = table ? line.replace(/CHARACTER SET utf8mb4 (?=COLLATE utf8mb4_)/g, '') : line;
    if (table && /^\) /.test(line)) table = false;
    return normalized;
  }).join('\n');
}
