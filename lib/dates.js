import { TZ } from './config';

// Dates are plain YYYY-MM-DD strings in venue time; math is done at UTC midnight so DST never shifts a day.
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
export const hourNow = () => Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }));
export const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && !isNaN(Date.parse(d));
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00Z`) - Date.parse(`${a}T00:00Z`)) / 864e5);
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const dayLabel = (d, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(`${d}T00:00Z`));
export const longDate = (d) => dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' });
export const shortDay = (d) => dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' });
export const stampFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });

// 7-day block (counted from `from`) that holds `date`; the day strips page through these.
export const weekOf = (from, date) => {
  const offset = Math.floor(daysBetween(from, date) / 7) * 7;
  const start = addDays(from, offset);
  return { offset, start, days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) };
};
