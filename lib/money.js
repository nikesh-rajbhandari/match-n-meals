import { rs } from './config.js'; // extension so plain node (money.test.mjs) can load it

// Whole rupees typed by staff: "2,000", "Rs 500" -> 2000, 500. Anything else (or an obvious typo, 1 crore+) -> null.
const clean = (v) => String(v ?? '').replace(/rs\.?|,|\s/gi, '');
export const parseRs = (v) => {
  const n = Number(clean(v));
  return clean(v) && Number.isInteger(n) && n > 0 && n < 1e7 ? n : null;
};

// Staff pick NPR (flat) or % with a switch: ('200', total) -> 200; ('10', total, true) -> 10% of total, rounded to the rupee.
// Blank or 0 clears the discount.
export function parseDiscount(input, total, pct = false) {
  let v = clean(input) || '0';
  if (pct) v = v.replace(/%$/, ''); // "10%" is fine once % is picked
  if (!/^\d+(\.\d+)?$/.test(v)) return { error: pct ? 'Enter a percentage, e.g. 10' : 'Enter an amount in rupees, e.g. 200' };
  const amount = Math.round(pct ? (total * Number(v)) / 100 : Number(v));
  if (amount > total) return { error: `A discount can’t be more than the total, ${rs(total)}` };
  return { amount };
}

// One booking's money. total = sum of hourly rates still booked (0 once every hour is cancelled);
// entries = its payments rows. due < 0 means it was overpaid (e.g. a discount set after paying in full).
export function summarize({ total }, entries) {
  const sum = (kind) => entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
  const discount = sum('discount'), refunded = sum('refund');
  const paid = sum('payment') - refunded;
  if (!total) {
    const state = paid > 0 ? 'held' : refunded ? 'refunded' : 'cancelled';
    return { total, discount: 0, paid, refunded, held: Math.max(0, paid), due: 0, state };
  }
  const due = total - discount - paid;
  const state = due < 0 ? 'over' : due === 0 ? 'paid' : paid > 0 ? 'part' : 'unpaid';
  return { total, discount, paid, refunded, held: 0, due, state };
}

export const STATE = { unpaid: 'Unpaid', part: 'Part paid', paid: 'Paid', over: 'Overpaid', held: 'Cancelled', refunded: 'Refunded' };
