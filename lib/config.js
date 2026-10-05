export const COURTS = { pickleball: 'Pickleball', basketball: 'Basketball' };
const perHour = (rs) => `Rs ${new Intl.NumberFormat('en-IN').format(rs)} / hr`;
export const PRICE = { pickleball: perHour(1500), basketball: perHour(1500) };
export const TZ = 'Asia/Kathmandu'; // business timezone; servers (Vercel) run in UTC
export const OPEN_HOUR = 6;
export const CLOSE_HOUR = 21; // last slot starts at 20:00

export const hours = () =>
  Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

const hourFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
export const fmtHour = (h) => hourFmt.format(Date.UTC(2000, 0, 1, h)); // "6:00 AM", non-breaking space included
