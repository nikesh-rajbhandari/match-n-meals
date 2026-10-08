'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql, log } from '@/lib/db';
import { isAdmin, backTo, moneyFor } from '@/lib/admin';
import { parseRs, parseDiscount } from '@/lib/money';
import { rs, spans, bookingRef, TZ } from '@/lib/config';

// Payments tab actions. Messages name the booking code, not the customer: ?msg= ends up in URLs and request logs.
const METHODS = ['cash', 'qr'];
const note = (form) => String(form.get('note') ?? '').trim().slice(0, 200) || null;
const done = (form, msg, err) => { revalidatePath('/admin'); redirect(backTo(form, msg, err)); };

// Record Payment popup: staff set an optional discount, the customer pays the total payable, staff confirm.
// The amount is worked out here, never taken from the browser; `expect` is what the popup showed, so a booking that
// changed meanwhile (another device recorded a payment) is refused instead of charged twice.
// One discount per bill (see moneyFor): a new value replaces it (the old one is voided, not deleted), blank removes it. Percent discounts store "10%" first in the note;
// the Payments tab reads it back to show the % and preselect the switch.
export async function recordPayment(form) {
  const me = await isAdmin();
  if (!me) return;
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
  await sql`with gone as (update payments set voided_by = ${me.name}, voided_at = now()
      where ref = any(${refs}::int[]) and kind = 'discount' and voided_at is null and ${changed}::boolean),
    d as (insert into payments (ref, kind, amount, note, created_by) select ${ref}, 'discount', ${off}::int, ${tag}, ${me.name} where ${changed}::boolean and ${off}::int > 0)
    insert into payments (ref, kind, amount, method, note, created_by) values (${ref}, 'payment', ${amount}, ${method}, ${note(form)}, ${me.name})`;
  const disc = !changed ? '' : off ? ` · discount ${tag ?? rs(off)}${old.length ? ` (was ${old.map((e) => e.note?.match(/^[\d.]+%/)?.[0] ?? rs(e.amount)).join(', ')})` : ''}`
    : ' · discount removed';
  await log(me.name, ref, `Recorded ${rs(amount)} ${method === 'qr' ? 'QR' : 'cash'} · paid in full${disc}`, changed && old.length > 0);
  done(form, `Recorded ${rs(amount)} on ${bookingRef(ref)}${off ? ` (after a ${rs(off)} discount)` : ''}. Paid in full.`);
}

// Undo a premature Confirm Payment: voids the booking's latest payment (kept, with who and when) so it's due again.
// The discount stays (the popup prefills it, so it can be changed before confirming again).
export async function unconfirmPayment(form) {
  const me = await isAdmin();
  if (!me) return;
  const { ref, refs } = await moneyFor(Number(form.get('ref'))) ?? {};
  const [p] = refs ? await sql`update payments set voided_by = ${me.name}, voided_at = now()
    where id = (select max(id) from payments where ref = any(${refs}::int[]) and kind = 'payment' and voided_at is null)
    returning amount` : [];
  if (p) await log(me.name, ref, `Unconfirmed the ${rs(p.amount)} payment · due again`, true);
  done(form, p ? `Unconfirmed the ${rs(p.amount)} payment on ${bookingRef(ref)}. It’s due again.` : 'There’s no payment to unconfirm', !p);
}

// Money back to the customer: what a cancelled booking still holds, or what was overpaid.
export async function refund(form) {
  const me = await isAdmin();
  if (!me) return;
  const amount = parseRs(form.get('amount')), method = String(form.get('method'));
  const m = await moneyFor(Number(form.get('ref'))), ref = m?.ref;
  const max = m ? Math.max(m.held, -m.due) : 0;
  if (!max) return done(form, 'There’s nothing to refund on this booking', true);
  if (!amount || amount > max) return done(form, `Enter a refund up to ${rs(max)}`, true);
  if (!METHODS.includes(method)) return done(form, 'Pick cash or QR', true);
  await sql`insert into payments (ref, kind, amount, method, note, created_by) values (${ref}, 'refund', ${amount}, ${method}, ${note(form)}, ${me.name})`;
  await log(me.name, ref, `Refunded ${rs(amount)} ${method === 'qr' ? 'QR' : 'cash'}`);
  done(form, `Refunded ${rs(amount)} on ${bookingRef(ref)}`);
}

// Undo a mistyped refund: voids the bill's latest refund (kept, crossed out, with who and when).
export async function undoRefund(form) {
  const me = await isAdmin();
  if (!me) return;
  const { ref, refs } = await moneyFor(Number(form.get('ref'))) ?? {};
  const [r] = refs ? await sql`update payments set voided_by = ${me.name}, voided_at = now()
    where id = (select max(id) from payments where ref = any(${refs}::int[]) and kind = 'refund' and voided_at is null)
    returning amount` : [];
  if (r) await log(me.name, ref, `Undid the ${rs(r.amount)} refund`, true);
  done(form, r ? `Undid the ${rs(r.amount)} refund on ${bookingRef(ref)}` : 'There’s no refund to undo', !r);
}

// Unpaid bills only: cancels every booking on the bill (kept as cancelled, with who and when) and frees the slots.
// A bill with money on it goes the long way (Unconfirm or Refund first), so no payment is ever lost track of.
export async function cancelBill(form) {
  const me = await isAdmin();
  if (!me) return;
  const m = await moneyFor(Number(form.get('ref')));
  if (!m) return done(form, 'That booking no longer exists', true);
  if (m.state !== 'unpaid') return done(form, `${bookingRef(m.ref)} has money recorded on it. Unconfirm or refund it first.`, true);
  const rows = await sql`update bookings set status = 'cancelled', changed_by = ${me.name}, changed_at = now()
    where coalesce(ref, id) = any(${m.refs}::int[]) and status = 'approved' returning hour`;
  await log(me.name, m.ref, `Cancelled (unpaid) · ${spans(rows.map((r) => r.hour).sort((a, b) => a - b))}`);
  done(form, `Cancelled ${m.refs.map(bookingRef).join(', ')} (${rows.length} h). The slot is free again.`);
}

// Elapsed bookings the customer didn't come to: the whole bill becomes no_show (with who and when). Whatever was paid
// (usually the deposit) is kept, and nothing more is owed.
export async function markNoShow(form) {
  const me = await isAdmin();
  if (!me) return;
  const m = await moneyFor(Number(form.get('ref')));
  if (!m) return done(form, 'That booking no longer exists', true);
  if (m.due <= 0) return done(form, `${bookingRef(m.ref)} has nothing left to pay`, true);
  const rows = await sql`update bookings set status = 'no_show', changed_by = ${me.name}, changed_at = now()
    where coalesce(ref, id) = any(${m.refs}::int[]) and status = 'approved'
      and not exists (select 1 from bookings o where coalesce(o.ref, o.id) = any(${m.refs}::int[]) and o.status = 'approved'
        and o.date + (o.hour + 1) * interval '1 hour' > now() at time zone ${TZ})
    returning id`;
  if (!rows.length) return done(form, `${bookingRef(m.ref)} hasn’t ended yet`, true);
  await log(me.name, m.ref, `Marked as a no-show${m.paid ? ` · ${rs(m.paid)} kept` : ''}`);
  done(form, `Marked ${m.refs.map(bookingRef).join(', ')} as a no-show${m.paid ? `. The ${rs(m.paid)} paid is kept.` : '.'}`);
}

// Undo a mistaken No-show: the bill's bookings are approved again (who and when go in changed_by/changed_at) and what's
// left is due again. Refused if someone has since booked one of those hours.
export async function undoNoShow(form) {
  const me = await isAdmin();
  if (!me) return;
  const m = await moneyFor(Number(form.get('ref')));
  if (m?.state !== 'noshow') return done(form, 'That booking isn’t a no-show', true);
  try {
    await sql`update bookings set status = 'approved', changed_by = ${me.name}, changed_at = now()
      where coalesce(ref, id) = any(${m.refs}::int[]) and status = 'no_show'`;
  } catch (e) {
    if (e.code !== '23505') throw e;
    return done(form, `One of those hours has been booked again, so ${bookingRef(m.ref)} can’t go back`, true);
  }
  await log(me.name, m.ref, 'Undid the no-show · approved again', true);
  done(form, `${m.refs.map(bookingRef).join(', ')} is no longer a no-show. What’s left is due again.`);
}
