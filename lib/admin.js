import { cookies } from 'next/headers';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import NepaliDate from 'nepali-date-converter';
import { sql } from './db';
import { summarize } from './money.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from './password.js';

// Staff log in with their own username + password (admins table). The `admin` cookie holds a random session token; the
// DB keeps only its sha256 (admin_sessions), so deleting a row logs that device out.
const sha = (s) => createHash('sha256').update(s).digest('hex');
const COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 }; // 30 days: the installed admin app shouldn't log out twice a day

// The signed-in staff member { id, username, name, role } or null. Every admin page and action starts here.
export async function isAdmin() {
  const c = (await cookies()).get('admin')?.value;
  if (!c) return null;
  const [a] = await sql`select a.id, a.username, a.name, a.role from admin_sessions s join admins a on a.id = s.admin_id
    where s.token_hash = ${sha(c)} and s.expires_at > now() and a.active`;
  return a ?? null;
}

export async function startSession(adminId) {
  const token = randomBytes(32).toString('base64url');
  await sql`with gone as (delete from admin_sessions where expires_at < now())
    insert into admin_sessions (token_hash, admin_id, expires_at) values (${sha(token)}, ${adminId}, now() + interval '30 days')`;
  (await cookies()).set('admin', token, COOKIE);
}

export async function endSession() {
  const jar = await cookies(), c = jar.get('admin')?.value;
  if (c) await sql`delete from admin_sessions where token_hash = ${sha(c)}`;
  jar.delete('admin');
}

// The permanent owner: username ADMIN_USERNAME (default "admin"), password always ADMIN_PASSWORD (.env locally, Vercel in
// production), so it's also the way back in if every other owner is locked out. Its row is marked env_owner; it can't be
// edited, disabled or demoted (staff-actions.js).
export const ENV_OWNER = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
const sameSecret = (a, b) => { const d = (s) => createHash('sha256').update(s).digest(); return timingSafeEqual(d(a), d(b)); };

// After a correct ADMIN_PASSWORD. Normally just returns the account. On first use it creates it; if ADMIN_USERNAME or
// ADMIN_PASSWORD changed (or the row was renamed in the database) it renames the one env_owner row back, stores the
// password and ends every earlier session, so rotating either value locks out anyone who knew the old one.
// Returns the account, or null if ADMIN_USERNAME is already a normal staff member's username.
async function envOwner(a) {
  const want = process.env.ADMIN_PASSWORD;
  if (a?.env_owner && verifyPassword(want, a.password)) return a;
  if (a && !a.env_owner) return null;
  const hash = hashPassword(want);
  const [row] = (await sql`update admins set username = ${ENV_OWNER}, password = ${hash}, role = 'owner', active = true
      where env_owner returning id`).concat(await sql`insert into admins (username, name, password, role, env_owner)
      select ${ENV_OWNER}, 'Admin', ${hash}, 'owner', true where not exists (select 1 from admins where env_owner) returning id`);
  await sql`delete from admin_sessions where admin_id = ${row.id}`;
  return row;
}

// Returns an error message, or starts a session and returns nothing. 5 wrong passwords lock the account for 15 minutes
// (then the count starts over). Unknown and disabled usernames get the same answer as a wrong password.
export async function logIn(username, password) {
  username = String(username ?? '').trim().toLowerCase(); password = String(password ?? '');
  let [a] = await sql`select id, password, active, env_owner, coalesce(locked_until > now(), false) as locked
    from admins where username = ${username}`;
  if (a?.locked) return 'Too many wrong tries. Wait 15 minutes, then try again.';
  const ok = username === ENV_OWNER
    ? !!process.env.ADMIN_PASSWORD && sameSecret(password, process.env.ADMIN_PASSWORD)
    : verifyPassword(password, a?.password ?? DUMMY_HASH) && a?.active;
  if (!ok) {
    if (a) await sql`update admins set failed_logins = case when failed_logins >= 4 then 0 else failed_logins + 1 end,
      locked_until = case when failed_logins >= 4 then now() + interval '15 minutes' end where id = ${a.id}`;
    return 'Wrong username or password';
  }
  if (username === ENV_OWNER && !(a = await envOwner(a)))
    return `ADMIN_USERNAME (${ENV_OWNER}) belongs to a staff account. Pick a different ADMIN_USERNAME.`;
  await sql`update admins set failed_logins = 0, locked_until = null where id = ${a.id}`;
  await startSession(a.id);
}

// Add Staff / Edit form: { username, name, password } or { error }.
// Edit passes optionalPassword: a blank password then means "keep the current one" (password: null).
export function staffFields(form, optionalPassword = false) {
  const username = String(form.get('username') ?? '').trim().toLowerCase();
  const name = String(form.get('name') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return { error: 'Usernames are 3-32 letters, numbers, dots, dashes or underscores' };
  if (!name || name.length > 60) return { error: 'Enter a name (up to 60 characters)' };
  if (optionalPassword && !password) return { username, name, password: null };
  const error = passwordError(password);
  return error ? { error } : { username, name, password: hashPassword(password) };
}
const passwordError = (pw) => (pw.length < 8 || pw.length > 200) && 'Passwords need at least 8 characters';

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
      from bookings where status in ('approved', 'cancelled', 'no_show') group by coalesce(ref, id))
    select ref from r where (court, day, phone) = (select court, day, phone from r where ref = ${ref})`).map((r) => r.ref);
  if (!refs.length) return null;
  const [[b], entries] = await Promise.all([
    sql`select coalesce(sum(rate) filter (where status = 'approved'), 0)::int as total, bool_or(status = 'no_show') as no_show
        from bookings where coalesce(ref, id) = any(${refs}::int[]) and status in ('approved', 'cancelled', 'no_show')`,
    sql`select kind, amount, note from payments where ref = any(${refs}::int[]) and voided_at is null`,
  ]);
  return { ...summarize(b, entries), ref: Math.min(...refs), refs, entries };
}
