import { philippineDate } from './philippine-dates';
const zone = 'Asia/Manila';
function display(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: zone, ...options }).format(date);
}
export function formatBillingPeriod(date: Date) { return display(date, { month: 'long', year: 'numeric' }); }
export function formatDate(date: Date) { return display(date, { month: 'long', day: 'numeric', year: 'numeric' }); }
export function formatDateShort(date: Date) { return display(date, { month: 'short', day: 'numeric' }); }
export function formatDateMed(date: Date) { return display(date, { month: 'short', day: 'numeric', year: 'numeric' }); }
export function formatDateInput(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function getBillingPeriod(year: number, month: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid billing month');
  const prefix = String(year) + '-' + String(month).padStart(2, '0') + '-';
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: philippineDate(prefix + '01'), end: philippineDate(prefix + String(lastDay), true) };
}
export function getCurrentBillingPeriod() {
  const [year, month] = formatDateInput(new Date()).split('-').map(Number);
  return getBillingPeriod(year, month);
}
export function getDueDate(from: Date, dayOfMonth = 15) {
  return philippineDate(formatDateInput(from).slice(0, 8) + String(dayOfMonth).padStart(2, '0'), true);
}
export function isOverdue(dueDate: Date) { return new Date() > dueDate; }
export function getMonthName(date: Date) { return display(date, { month: 'long' }); }
