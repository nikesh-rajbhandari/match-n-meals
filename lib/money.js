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

// One booking's money. total = sum of hourly rates still booked (0 once every hour is cancelled or a no-show);
// noShow = the customer didn't come: whatever was paid is kept, nothing is held or due.
// entries = its payments rows; voided ones (undone, kept for the record) don't count. due < 0 means it was overpaid
// (e.g. a discount set after paying in full).
export function summarize({ total, no_show: noShow }, entries) {
  entries = entries.filter((e) => !e.voided_at);
  const sum = (kind) => entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
  const discount = sum('discount'), refunded = sum('refund');
  const paid = sum('payment') - refunded;
  if (!total && noShow) return { total, discount: 0, paid, refunded, held: 0, due: 0, state: 'noshow' };
  if (!total) {
    const state = paid > 0 ? 'held' : refunded ? 'refunded' : 'cancelled';
    return { total, discount: 0, paid, refunded, held: Math.max(0, paid), due: 0, state };
  }
  const due = total - discount - paid;
  const state = due < 0 ? 'over' : due === 0 ? 'paid' : paid > 0 ? 'part' : 'unpaid';
  return { total, discount, paid, refunded, held: 0, due, state };
}

// Who collected the money the venue kept, per staff and method: { [who]: { cash, qr } }. bills = [{ entries }].
// A refund gives back a payment on its own bill, so it comes off that payment's collector (same method first, newest
// first), never off whoever pressed Refund. Undone entries don't count. The grand total equals summarize()'s paid.
export function collectedBy(bills) {
  const out = {};
  for (const { entries } of bills) {
    const live = entries.filter((e) => !e.voided_at);
    const pays = live.filter((e) => e.kind === 'payment').map((e) => ({ who: e.created_by ?? 'Not recorded', method: e.method, left: e.amount }));
    for (const r of live.filter((e) => e.kind === 'refund')) {
      let owe = r.amount;
      const order = [...pays].reverse().sort((x, y) => (y.method === r.method) - (x.method === r.method)); // stable sort
      for (const p of order) { const t = Math.min(p.left, owe); p.left -= t; owe -= t; if (!owe) break; }
    }
    for (const p of pays) if (p.left) (out[p.who] ??= { cash: 0, qr: 0 })[p.method] += p.left;
  }
  return out;
}

export const STATE = { unpaid: 'Unpaid', part: 'Part paid', paid: 'Paid', over: 'Overpaid', held: 'Cancelled', refunded: 'Refunded', noshow: 'No-show' };
