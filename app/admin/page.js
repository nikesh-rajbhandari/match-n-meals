import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createHash, timingSafeEqual } from 'node:crypto';
import { sql } from '@/lib/db';
import ConfirmButton from './ConfirmButton';
import { COURTS, OPEN_HOUR, CLOSE_HOUR, TZ, hours, fmtHour } from '@/lib/config';

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
    revalidatePath('/admin');
    redirect('/admin');
  }
  redirect('/admin?bad=1');
}

async function logout() {
  'use server';
  (await cookies()).delete('admin');
  revalidatePath('/admin');
}

async function approve(form) {
  'use server';
  if (!(await isAdmin())) return;
  await sql`update bookings set status = 'approved' where id = ${Number(form.get('id'))}`;
  revalidatePath('/admin');
}

// Reject (pending) and cancel (approved) both delete the row, which frees the slot.
async function cancel(form) {
  'use server';
  if (!(await isAdmin())) return;
  await sql`delete from bookings where id = ${Number(form.get('id'))}`;
  revalidatePath('/admin');
}

// Walk-ins and phone bookings: one or more consecutive hours, approved straight away.
async function addBooking(form) {
  'use server';
  if (!(await isAdmin())) return;
  const f = Object.fromEntries(form);
  const hour = Number(f.hour), len = Number(f.length);
  const name = String(f.name ?? '').trim(), phone = String(f.phone ?? '').trim();
  const email = String(f.email ?? '').trim() || null;
  const fail = (msg) => redirect(`/admin?add=1&msg=${encodeURIComponent(msg)}`);

  if (!COURTS[f.court] || !/^\d{4}-\d{2}-\d{2}$/.test(f.date ?? '')) fail('Pick a court and a date');
  if (!Number.isInteger(hour) || !Number.isInteger(len) || len < 1 || hour < OPEN_HOUR || hour + len > CLOSE_HOUR)
    fail(`Times must fall between ${fmtHour(OPEN_HOUR)} and ${fmtHour(CLOSE_HOUR)}`);
  if (!name || name.length > 100 || !phone || phone.length > 20) fail('Enter the customer’s name and phone number');

  try {
    // one statement = all hours or none
    await sql`insert into bookings (court, date, hour, name, phone, email, status)
              select ${f.court}, ${f.date}, h, ${name}, ${phone}, ${email}, 'approved'
              from generate_series(${hour}::int, ${hour + len - 1}::int) h`;
  } catch (e) {
    if (e.code === '23505') fail('One of those hours is already booked. Pick a different start time or fewer hours.');
    throw e;
  }
  revalidatePath('/admin');
  redirect(`/admin?date=${f.date}&msg=${encodeURIComponent(`Added ${len} ${len === 1 ? 'hour' : 'hours'} for ${name}`)}`);
}

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const fmtDay = (d) => dayFmt.format(new Date(`${d}T00:00Z`));
const stampFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });

export default async function Admin({ searchParams }) {
  if (!(await isAdmin())) {
    const { bad } = await searchParams;
    return (
      <section className="section login">
        <div className="panel">
          <h1>Admin</h1>
          <form action={login} className="form">
            {/* autoFocus: the only field on the page */}
            <label>Password<input name="password" type="password" required autoFocus autoComplete="current-password" aria-describedby={bad ? 'login-err' : undefined} /></label>
            {bad && <p className="err" id="login-err" role="alert">Wrong password. Try again.</p>}
            <button className="btn big">Log In</button>
          </form>
        </div>
      </section>
    );
  }

  const { date: d, view: v, add, msg } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? d : null;
  const view = date ? 'date' : ['pending', 'all'].includes(v) ? v : 'upcoming';
  // upcoming = slot hasn't ended yet, in business local time
  const [rows, [{ pending }]] = await Promise.all([
    view === 'date' ? sql`select *, date::text as day from bookings where date = ${date} order by hour, court`
      : view === 'all' ? sql`select *, date::text as day from bookings order by date desc, hour limit 500`
      : view === 'pending' ? sql`select *, date::text as day from bookings where status = 'pending' and date + (hour + 1) * interval '1 hour' > now() at time zone ${TZ} order by date, hour, court`
      : sql`select *, date::text as day from bookings where date + (hour + 1) * interval '1 hour' > now() at time zone ${TZ} order by date, hour, court limit 500`,
    sql`select count(*)::int as pending from bookings where status = 'pending' and date + (hour + 1) * interval '1 hour' > now() at time zone ${TZ}`,
  ]);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const tab = (key, label, href) => <a href={href} aria-current={view === key ? 'page' : undefined}>{label}</a>;

  return (
    <section className="section admin">
      <div className="admin-head">
        <h1>Bookings</h1>
        <form action={logout}><button className="btn ghost">Log Out</button></form>
      </div>

      {msg && <p className="notice" role="status">{msg}</p>}

      <details className="panel add" open={!!add}>
        <summary>Add a Booking</summary>
        <form action={addBooking} className="add-form" autoComplete="off">
          <label>Court
            <select name="court" required>{Object.entries(COURTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label>Date<input type="date" name="date" defaultValue={today} required /></label>
          <label>Start
            <select name="hour" required>{hours().map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}</select>
          </label>
          <label>Hours
            <select name="length">{hours().map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
          </label>
          <label>Name<input name="name" required maxLength={100} autoComplete="off" placeholder="Customer name…" /></label>
          <label>Phone<input name="phone" type="tel" inputMode="tel" required maxLength={20} autoComplete="off" placeholder="98XXXXXXXX…" /></label>
          <label>Email <span className="muted">(optional)</span><input name="email" type="email" autoComplete="off" spellCheck={false} /></label>
          <button className="btn">Add Booking</button>
        </form>
      </details>

      <div className="toolbar">
        <nav className="tabs-nav" aria-label="Booking views">
          {tab('pending', <>Pending {pending > 0 && <b className="count">{pending}</b>}</>, '/admin?view=pending')}
          {tab('upcoming', 'Upcoming', '/admin')}
          {tab('all', 'All', '/admin?view=all')}
        </nav>
        <form className="date-filter">
          <input type="date" name="date" defaultValue={date ?? ''} aria-label="Filter by date" />
          <button className="btn ghost">Show Day</button>
        </form>
      </div>

      <p className="muted">{`${rows.length} ${rows.length === 1 ? 'booking' : 'bookings'}${date ? ` on ${fmtDay(date)}` : ''}`}</p>
      {rows.length === 0 ? (
        <p className="empty">{view === 'pending' ? 'Nothing waiting for approval.' : 'No bookings here. Use Add a Booking above for walk-ins.'}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Status</th><th>Date</th><th>Time</th><th>Court</th><th>Name</th><th>Phone</th><th>Email</th><th>Requested</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span className={`status ${r.status}`}>{r.status === 'pending' ? 'Pending' : 'Approved'}</span></td>
                  <td>{fmtDay(r.day)}</td>
                  <td>{fmtHour(r.hour)}</td>
                  <td>{COURTS[r.court]}</td>
                  <td className="clip" title={r.name}>{r.name}</td>
                  <td><a href={`tel:${r.phone}`}>{r.phone}</a></td>
                  <td className="clip" title={r.email ?? undefined}>{r.email}</td>
                  <td>{stampFmt.format(new Date(r.created_at))}</td>
                  <td className="actions">
                    {r.status === 'pending' && (
                      <form action={approve}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn small">Approve</button>
                      </form>
                    )}
                    <form action={cancel}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton className="link-danger" message={`${r.status === 'pending' ? 'Reject' : 'Cancel'} ${r.name}’s ${fmtHour(r.hour)} booking on ${fmtDay(r.day)}? This frees the slot.`}>
                        {r.status === 'pending' ? 'Reject' : 'Cancel'}
                      </ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
