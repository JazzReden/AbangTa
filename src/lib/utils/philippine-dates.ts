export function philippineDate(value: string, endOfDay = false): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a valid calendar date');
  const date = new Date(value + (endOfDay ? 'T23:59:59.999+08:00' : 'T00:00:00.000+08:00'));
  const calendar = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  if (!Number.isFinite(date.getTime()) || calendar !== value) throw new Error('Enter a valid calendar date');
  return date;
}
