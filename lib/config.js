export const COURTS = { pickleball: 'Pickleball', basketball: 'Basketball' };
export const PRICE = { pickleball: 'Rs 1500 / hr', basketball: 'Rs 1500 / hr' };
export const TZ = 'Asia/Kathmandu'; // business timezone; servers (Vercel) run in UTC
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 22; // last slot starts at 21:00

export const hours = () =>
  Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

export const fmtHour = (h) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
