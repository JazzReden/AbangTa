// Fixed event names/codes only: never log SQL, error messages, credentials or records.
export function operationEvent(event: 'database.error' | 'reminders.failed' | 'reminders.recovered', error?: unknown) {
  const candidate = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const code = /^P\d{4}$/.test(candidate) ? candidate : 'UNAVAILABLE';
  const entry = JSON.stringify({ event, code, at: new Date().toISOString() });
  if (event === 'reminders.recovered') console.info(entry); else console.error(entry);
}
