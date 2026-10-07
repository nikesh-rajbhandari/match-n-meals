import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';
import NepaliDate from 'nepali-date-converter';
import { sql } from './db';
import { summarize } from './money.js';

// The admin cookie holds a hash of the password, so changing ADMIN_PASSWORD logs everyone out.
export const adminToken = () => createHash('sha256').update(`mnm:${process.env.ADMIN_PASSWORD}`).digest('hex');

export async function isAdmin() {
  const c = (await cookies()).get('admin')?.value;
  return !!process.env.ADMIN_PASSWORD && !!c && c.length === 64 &&
    timingSafeEqual(Buffer.from(c), Buffer.from(adminToken()));
}

// Every action posts `back` (the current admin URL) so the admin stays on the same view after acting;
// a #hash in it (e.g. #pay-41) scrolls back to the row that was edited.
// Success goes in ?msg= (auto-hides), problems in ?err= (stays until closed); see app/admin/Notice.js.
export const backTo = (form, msg, err) => {
  const back = String(form.get('back') ?? '/admin');
  const url = new URL(back.startsWith('/admin') ? back : '/admin', 'http://x');
  url.searchParams.delete('msg'); url.searchParams.delete('err');
  if (msg) url.searchParams.set(err ? 'err' : 'msg', msg);
  return `${url.pathname}${url.search}${url.hash}`;
};

// Bikram Sambat (Nepali calendar), shown next to the English date: '2026-10-07' -> "21 Aswin 2083".
// Built from local date parts so the server's timezone can't shift the day. Admin-only (keeps the converter off the booking page).
export const bs = (d, fmt = 'D MMMM YYYY') => {
  const [y, m, day] = d.split('-').map(Number);
  return NepaliDate.fromAD(new Date(y, m - 1, day)).format(fmt);
};

// A bill = one customer's approved/cancelled bookings on one court and day (same phone digits), paid together.
// Each booking keeps its own code on the Bookings tab; money is recorded on the bill's lowest ref (`ref`).
// Same key as the grouping in app/admin/Payments.js.
export const billKey = (b) => `${b.court}|${b.day}|${String(b.phone).replace(/\D/g, '')}`;

// One bill's money (see summarize) plus its refs, or null if there's no approved/cancelled booking with that ref.
// Server-only on purpose: never export reads from a 'use server' file, those become public endpoints.
export async function moneyFor(ref) {
  if (!Number.isInteger(ref)) return null;
  // ponytail: groups the whole table to find the bill; fine for one venue, filter by date if it ever gets slow
  const refs = (await sql`with r as (
      select coalesce(ref, id) as ref, min(court) as court, min(date) as day, regexp_replace(min(phone), '[^0-9]', '', 'g') as phone
      from bookings where status <> 'pending' group by coalesce(ref, id))
    select ref from r where (court, day, phone) = (select court, day, phone from r where ref = ${ref})`).map((r) => r.ref);
  if (!refs.length) return null;
  const [[b], entries] = await Promise.all([
    sql`select coalesce(sum(rate) filter (where status <> 'cancelled'), 0)::int as total
        from bookings where coalesce(ref, id) = any(${refs}::int[]) and status <> 'pending'`,
    sql`select kind, amount, note from payments where ref = any(${refs}::int[])`,
  ]);
  return { ...summarize(b, entries), ref: Math.min(...refs), refs, entries };
}
