'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { isAdmin, backTo, moneyFor } from '@/lib/admin';
import { parseRs, parseDiscount } from '@/lib/money';
import { rs, bookingRef } from '@/lib/config';

// Payments tab actions. Messages name the booking code, not the customer: ?msg= ends up in URLs and request logs.
const METHODS = ['cash', 'qr'];
const note = (form) => String(form.get('note') ?? '').trim().slice(0, 200) || null;
const done = (form, msg, err) => { revalidatePath('/admin'); redirect(backTo(form, msg, err)); };

// Record Payment popup: staff set an optional discount, the customer pays the total payable, staff confirm.
// The amount is worked out here, never taken from the browser; `expect` is what the popup showed, so a booking that
// changed meanwhile (another device recorded a payment) is refused instead of charged twice.
// One discount per bill (see moneyFor): a new value replaces it, blank removes it. Percent discounts store "10%" first in the note;
// the Payments tab reads it back to show the % and preselect the switch.
export async function recordPayment(form) {
  if (!(await isAdmin())) return;
  const method = String(form.get('method'));
  const input = String(form.get('discount') ?? '').trim(), pct = form.get('unit') === 'pct';
  const m = await moneyFor(Number(form.get('ref')));
  if (!m) return done(form, 'That booking no longer exists', true);
  const { ref, refs } = m;
  if (!m.total) return done(form, 'This booking is cancelled, so there’s nothing to record', true);
  if (!METHODS.includes(method)) return done(form, 'Pick cash or QR', true);
  const { amount: off, error } = parseDiscount(input, m.total, pct);
  if (error) return done(form, error, true);
  const amount = m.total - off - m.paid;
  if (amount !== Number(form.get('expect'))) return done(form, `${bookingRef(ref)} changed while the popup was open. Check it and try again.`, true);
  if (amount <= 0) return done(form, 'There’s nothing left to pay on this booking', true);

  const tag = pct && off ? `${input.replace(/[%\s]/g, '')}%` : null;
  const old = m.entries.filter((e) => e.kind === 'discount'); // more than one if bookings merged into this bill later
  const changed = old.length > 1 || (old[0]?.amount ?? 0) !== off || (old[0]?.note?.match(/^[\d.]+%/)?.[0] ?? null) !== tag;
  // one statement = discount and payment together or not at all
  await sql`with gone as (delete from payments where ref = any(${refs}::int[]) and kind = 'discount' and ${changed}::boolean),
    d as (insert into payments (ref, kind, amount, note) select ${ref}, 'discount', ${off}::int, ${tag} where ${changed}::boolean and ${off}::int > 0)
    insert into payments (ref, kind, amount, method, note) values (${ref}, 'payment', ${amount}, ${method}, ${note(form)})`;
  done(form, `Recorded ${rs(amount)} on ${bookingRef(ref)}${off ? ` (after a ${rs(off)} discount)` : ''}. Paid in full.`);
}

// Undo a premature Confirm Payment: drops the booking's latest payment so it's due again. The discount stays (the popup
// prefills it, so it can be changed before confirming again).
export async function unconfirmPayment(form) {
  if (!(await isAdmin())) return;
  const { ref, refs } = await moneyFor(Number(form.get('ref'))) ?? {};
  const [p] = refs ? await sql`delete from payments
    where id = (select max(id) from payments where ref = any(${refs}::int[]) and kind = 'payment') returning amount` : [];
  done(form, p ? `Unconfirmed the ${rs(p.amount)} payment on ${bookingRef(ref)}. It’s due again.` : 'There’s no payment to unconfirm', !p);
}

// Money back to the customer: what a cancelled booking still holds, or what was overpaid.
export async function refund(form) {
  if (!(await isAdmin())) return;
  const amount = parseRs(form.get('amount')), method = String(form.get('method'));
  const m = await moneyFor(Number(form.get('ref'))), ref = m?.ref;
  const max = m ? Math.max(m.held, -m.due) : 0;
  if (!max) return done(form, 'There’s nothing to refund on this booking', true);
  if (!amount || amount > max) return done(form, `Enter a refund up to ${rs(max)}`, true);
  if (!METHODS.includes(method)) return done(form, 'Pick cash or QR', true);
  await sql`insert into payments (ref, kind, amount, method, note) values (${ref}, 'refund', ${amount}, ${method}, ${note(form)})`;
  done(form, `Refunded ${rs(amount)} on ${bookingRef(ref)}`);
}

// Undo a mistyped entry.
export async function removeEntry(form) {
  if (!(await isAdmin())) return;
  const id = Number(form.get('id'));
  const [e] = Number.isInteger(id) ? await sql`delete from payments where id = ${id} returning ref, kind, amount` : [];
  done(form, e && `Removed the ${rs(e.amount)} ${e.kind} from ${bookingRef(e.ref)}`);
}
