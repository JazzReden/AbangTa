import { formatDateInput, getBillingPeriod } from '@/lib/utils/dates';
import { philippineDate } from '@/lib/utils/philippine-dates';
import type { AssistantPlan } from './contracts';

const day = 86400000;
export function assistantPeriod(period: AssistantPlan['period'], now: Date) {
  const today = philippineDate(formatDateInput(now));
  const [year, month] = formatDateInput(now).split('-').map(Number);
  const current = getBillingPeriod(year, month);
  const previous = getBillingPeriod(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  if (period === 'THIS_WEEK') {
    const weekday = new Date(today.getTime() + 8 * 3600000).getUTCDay();
    const start = new Date(today.getTime() - ((weekday + 6) % 7) * day);
    return { start, end: new Date(now.getTime() + 1), previousStart: new Date(start.getTime() - 7 * day), previousEnd: new Date(now.getTime() + 1 - 7 * day), comparable: true };
  }
  if (period === 'LAST_MONTH') {
    const earlier = getBillingPeriod(month <= 2 ? year - 1 : year, month === 1 ? 11 : month === 2 ? 12 : month - 2);
    return { start: previous.start, end: new Date(previous.end.getTime() + 1), previousStart: earlier.start, previousEnd: new Date(earlier.end.getTime() + 1), comparable: true };
  }
  const end = new Date(now.getTime() + 1);
  const previousEnd = new Date(Math.min(previous.end.getTime() + 1, previous.start.getTime() + end.getTime() - current.start.getTime()));
  return { start: current.start, end, previousStart: previous.start, previousEnd, comparable: previousEnd.getTime() - previous.start.getTime() === end.getTime() - current.start.getTime() };
}

export function manilaTimestamp(date: Date) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(date) + ' (Asia/Manila)';
}
export function dateRange(start: Date, end: Date) { return manilaTimestamp(start) + ' to ' + manilaTimestamp(new Date(end.getTime() - 1)); }
