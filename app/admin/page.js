import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createHash, timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';
import { COURTS, fmtHour, TZ } from '@/lib/config';

export const dynamic = 'force-dynamic';

const token = () => createHash('sha256').update(`mnm:${process.env.ADMIN_PASSWORD}`).digest('hex');

async function isAdmin() {
  const c = (await cookies()).get('admin')?.value;
  return !!process.env.ADMIN_PASSWORD && !!c && c.length === 64 &&
    timingSafeEqual(Buffer.from(c), Buffer.from(token()));
}

async function login(form) {
  'use server';
  if (process.env.ADMIN_PASSWORD && form.get('password') === process.env.ADMIN_PASSWORD) {
    (await cookies()).set('admin', token(), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 12 });
  }
  revalidatePath('/admin');
}

async function logout() {
  'use server';
  (await cookies()).delete('admin');
  revalidatePath('/admin');
}

async function cancel(form) {
  'use server';
  if (!(await isAdmin())) return;
  await sql`delete from bookings where id = ${Number(form.get('id'))}`;
  revalidatePath('/admin');
}

export default async function Admin({ searchParams }) {
  if (!(await isAdmin())) {
    return (
      <section className="section narrow">
        <h1>Admin login</h1>
        <form action={login} className="form">
          <label>Password<input name="password" type="password" required autoFocus /></label>
          <button className="btn">Log in</button>
        </form>
      </section>
    );
  }

  const { date: d, all } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") ? d : null;
  const rows = date
    ? await sql`select *, date::text as day from bookings where date = ${date} order by hour, court`
    : all
      ? await sql`select *, date::text as day from bookings order by date desc, hour limit 500`
      // upcoming = slot hasn't ended yet, in business local time
      : await sql`select *, date::text as day from bookings
                  where date + (hour + 1) * interval '1 hour' > now() at time zone ${TZ}
                  order by date, hour, court limit 500`;
  const view = date ? 'date' : all ? 'all' : 'upcoming';

  return (
    <section className="section">
      <div className="row between">
        <h1>Bookings</h1>
        <form action={logout}><button className="btn ghost">Log out</button></form>
      </div>
      <form className="row">
        <input type="date" name="date" defaultValue={date ?? ''} />
        <button className="btn">Filter</button>
        <a href="/admin" className={`btn ${view === 'upcoming' ? '' : 'ghost'}`}>Upcoming</a>
        <a href="/admin?all=1" className={`btn ${view === 'all' ? '' : 'ghost'}`}>All</a>
      </form>
      <p>{`${rows.length} ${view === 'upcoming' ? 'upcoming ' : ''}booking(s)${date ? ` on ${date}` : ''}`}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Time</th><th>Court</th><th>Name</th><th>Phone</th><th>Email</th><th>Booked at</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.day}</td>
                <td>{fmtHour(r.hour)}</td>
                <td>{COURTS[r.court]}</td>
                <td>{r.name}</td>
                <td><a href={`tel:${r.phone}`}>{r.phone}</a></td>
                <td>{r.email}</td>
                <td>{new Date(r.created_at).toLocaleString('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>
                  <form action={cancel}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="link-danger">Cancel</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
