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

// One booking's money (see summarize), or null if there's no approved/cancelled booking with that ref.
// Server-only on purpose: never export reads from a 'use server' file, those become public endpoints.
export async function moneyFor(ref) {
  if (!Number.isInteger(ref)) return null;
  const [[b], entries] = await Promise.all([
    sql`select count(*)::int as n, coalesce(sum(rate) filter (where status <> 'cancelled'), 0)::int as total
        from bookings where coalesce(ref, id) = ${ref} and status <> 'pending'`,
    sql`select kind, amount from payments where ref = ${ref}`,
  ]);
  return b.n ? summarize(b, entries) : null;
}
