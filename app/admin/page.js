import Link from 'next/link';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { notifyAdmins } from '@/lib/push';
import NepaliDate from 'nepali-date-converter';
import { COURTS, OPEN_HOUR, CLOSE_HOUR, TZ, DEPOSIT, RATE, hours, fmtHour, rs, bookingRef, waLink, waNumber } from '@/lib/config';
import { today, hourNow, isDate, addDays, dayLabel, longDate, weekOf } from '@/lib/dates';
import Icon from '@/app/Icon';
import { isAdmin, adminToken } from '@/lib/admin';
import ConfirmButton from './ConfirmButton';
import Notifications from './Notifications';
import Notice from './Notice';
import HourBoard from './HourBoard';
import Refresher from './Refresher';
import PasswordInput from './PasswordInput';

export const dynamic = 'force-dynamic';

// Installable as its own app (home screen, standalone window); the manifest's scope is /admin only.
export const metadata = {
  title: 'Admin | Match & Meals',
  manifest: '/admin.webmanifest',
  icons: { apple: '/icons/apple-touch.png' },
  appleWebApp: { capable: true, title: 'M&M Admin', statusBarStyle: 'default' },
};

async function login(form) {
  'use server';
  if (process.env.ADMIN_PASSWORD && form.get('password') === process.env.ADMIN_PASSWORD) {
    (await cookies()).set('admin', adminToken(), { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 }); // 30 days: the installed admin app shouldn't log out twice a day
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

// Every action posts `back` (the current admin URL) so the admin stays on the same court/day after acting.
// Success goes in ?msg= (auto-hides), problems in ?err= (stays until closed); see Notice.js.
const backTo = (form, msg, err) => {
  const back = String(form.get('back') ?? '/admin');
  const url = new URL(back.startsWith('/admin') ? back : '/admin', 'http://x');
  url.searchParams.delete('msg'); url.searchParams.delete('err');
  if (msg) url.searchParams.set(err ? 'err' : 'msg', msg);
  return `${url.pathname}${url.search}`;
};

async function approve(form) {
  'use server';
  if (!(await isAdmin())) return;
  const [b] = await sql`update bookings set status = 'approved' where id = ${Number(form.get('id'))} returning name, hour`;
  revalidatePath('/admin');
  redirect(backTo(form, b && `Approved ${b.name}, ${fmtHour(b.hour)}`));
}

// Reject (pending) and cancel (approved) both delete the row, which frees the slot.
async function cancel(form) {
  'use server';
  if (!(await isAdmin())) return;
  const [b] = await sql`delete from bookings where id = ${Number(form.get('id'))} returning name, hour, status`;
  revalidatePath('/admin');
  redirect(backTo(form, b && `${b.status === 'pending' ? 'Rejected' : 'Cancelled'} ${b.name}, ${fmtHour(b.hour)}. The slot is free again.`));
}

// Walk-ins and phone bookings: one or more consecutive hours from a free slot, approved straight away.
async function addBooking(form) {
  'use server';
  if (!(await isAdmin())) return;
  const f = Object.fromEntries(form);
  const picked = [...new Set(form.getAll('hours').map(Number))].sort((a, b) => a - b); // ticked 1-hour blocks
  const name = String(f.name ?? '').trim(), phone = String(f.phone ?? '').trim();
  const email = String(f.email ?? '').trim() || null;

  let msg, err = true;
  if (!COURTS[f.court] || !isDate(f.date)) msg = 'Pick a court and a date';
  else if (!picked.length) msg = 'Pick at least one hour';
  else if (!picked.every((h) => Number.isInteger(h) && h >= OPEN_HOUR && h < CLOSE_HOUR))
    msg = `Times must fall between ${fmtHour(OPEN_HOUR)} and ${fmtHour(CLOSE_HOUR)}`;
  else if (!name || name.length > 100 || !phone || phone.length > 20) msg = 'Enter the customer’s name and phone number';
  else {
    try {
      // one statement = all ticked hours or none
      await sql`insert into bookings (court, date, hour, name, phone, email, status)
                select ${f.court}, ${f.date}, h, ${name}, ${phone}, ${email}, 'approved'
                from unnest(${picked}::int[]) h`;
      msg = `Booked ${name}, ${spans(picked)}`; err = false;
      // tell the other admins' devices; this one already knows
      after(() => notifyAdmins({
        title: `Booked by admin: ${COURTS[f.court]}, ${spans(picked)}`,
        body: `${name} · ${shortDay(f.date)}`,
        url: `/admin?${new URLSearchParams({ court: f.court, date: f.date, hour: picked[0] })}#detail`,
      }, String(f.push ?? '')));
    } catch (e) {
      if (e.code !== '23505') throw e;
      msg = 'One of those hours was just taken. Pick a different hour.';
    }
  }
  revalidatePath('/admin');
  redirect(backTo(form, msg, err));
}

// [13, 14, 16] -> "1:00 PM - 3:00 PM, 4:00 PM - 5:00 PM"
const spans = (hs) => hs.reduce((out, h) => {
  const last = out[out.length - 1];
  if (last && last[1] === h) last[1] = h + 1; else out.push([h, h + 1]);
  return out;
}, []).map(([a, b]) => `${fmtHour(a)} - ${fmtHour(b)}`).join(', ');

const stampFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
const shortDay = (d) => dayLabel(d, { weekday: 'short', month: 'short', day: 'numeric' });
// Bikram Sambat (Nepali calendar), shown next to the English date: '2026-10-07' -> "21 Aswin 2083".
// Built from local date parts so the server's timezone can't shift the day.
const bs = (d, fmt = 'D MMMM YYYY') => {
  const [y, m, day] = d.split('-').map(Number);
  return NepaliDate.fromAD(new Date(y, m - 1, day)).format(fmt);
};

// "12 min ago" / "3 h ago" / "2 d ago"; requests older than STALE_H get a nudge (we can't know if the screenshot was sent)
const STALE_H = 2;
const ageHours = (b) => (Date.now() - new Date(b.created_at)) / 36e5;
const ago = (b) => {
  const m = Math.max(1, Math.round(ageHours(b) * 60));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

// One-tap WhatsApp to the customer from the admin app (it runs on the admin's phone, where WhatsApp is)
const waCustomer = (b) => {
  const when = `${COURTS[b.court]}, ${shortDay(b.day)}, ${fmtHour(b.hour)}`;
  const text = b.status === 'pending'
    ? `Hi ${b.name}, this is Match & Meals about your booking ${bookingRef(b.id)} (${when}). Please pay the ${rs(DEPOSIT)} deposit and send the screenshot here to confirm it.`
    : `Hi ${b.name}, your booking ${bookingRef(b.id)} is confirmed: ${when}. Please pay the remaining ${rs(RATE - DEPOSIT)} at the counter. See you!`;
  return waLink(waNumber(b.phone), text);
};

export default async function Admin({ searchParams }) {
  const q = await searchParams;
  if (!(await isAdmin())) {
    return (
      <section className="section login">
        <div className="panel">
          <h1>Admin</h1>
          <form action={login} className="form">
            {/* autoFocus: the only field on the page */}
            <label htmlFor="password">Password</label>
            <PasswordInput id="password" name="password" required autoFocus autoComplete="current-password" aria-describedby={q.bad ? 'login-err' : undefined} />
            {q.bad && <p className="err" id="login-err" role="alert">Wrong password. Try again.</p>}
            <button className="btn big">Log In</button>
          </form>
        </div>
      </section>
    );
  }

  // view state lives in the URL: ?court=&date=&hour=
  const t = today();
  const court = COURTS[q.court] ? q.court : 'pickleball';
  const date = isDate(q.date) ? q.date : t;
  const hour = hours().includes(Number(q.hour)) ? Number(q.hour) : null;
  const href = (o) => `/admin?${new URLSearchParams({ court, date, ...o })}`;
  const here = href(hour === null ? {} : { hour });

  const [pending, day] = await Promise.all([
    sql`select *, date::text as day from bookings
        where status = 'pending' and date + (hour + 1) * interval '1 hour' > now() at time zone ${TZ}
        order by date, hour, court`,
    sql`select *, date::text as day from bookings where court = ${court} and date = ${date}`,
  ]);
  const byHour = Object.fromEntries(day.map((b) => [b.hour, b]));
  const sel = hour === null ? null : byHour[hour] ?? null;
  const { offset, start, days } = weekOf(t, date);
  const nowHour = date === t ? hourNow() : date < t ? 99 : -1; // hours before this have already started
  const slots = hours().map((h) => ({ h, state: byHour[h]?.status ?? 'free', name: byHour[h]?.name ?? null, past: h < nowHour }));

  const Back = () => <input type="hidden" name="back" value={here} />;
  const Actions = ({ b }) => (
    <div className="actions">
      {b.status === 'pending' && (
        <form action={approve}><Back /><input type="hidden" name="id" value={b.id} /><button className="btn">Approve</button></form>
      )}
      <form action={cancel}>
        <Back /><input type="hidden" name="id" value={b.id} />
        <ConfirmButton className="btn ghost danger"
          message={`${b.status === 'pending' ? 'Reject' : 'Cancel'} ${b.name}’s ${fmtHour(b.hour)} booking on ${shortDay(b.day)}? This frees the slot.`}>
          {b.status === 'pending' ? 'Reject' : 'Cancel'}
        </ConfirmButton>
      </form>
    </div>
  );

  return (
    <section className="section admin">
      <div className="admin-head">
        <h1>Bookings</h1>
        <form action={logout}><button className="btn ghost">Log Out</button></form>
      </div>

      <Refresher />
      <Notifications />
      {(q.msg || q.err) && <Notice key={q.msg || q.err} text={q.msg || q.err} error={!!q.err} />}

      <h2 className="admin-h">Needs Approval {pending.length > 0 && <b className="count">{pending.length}</b>}</h2>
      {pending.length === 0 ? (
        <p className="empty">All caught up. New requests from the website show up here.</p>
      ) : (
        <ul className="requests">
          {pending.map((b) => (
            <li key={b.id} className="request">
              <Link href={`/admin?${new URLSearchParams({ court: b.court, date: b.day, hour: b.hour })}#detail`} className="request-when">
                <strong>{shortDay(b.day)}, {fmtHour(b.hour)} <small className="bs">{bs(b.day, 'D MMMM')}</small></strong>
                <span><Icon name={b.court} /> {COURTS[b.court]} · <b translate="no">{bookingRef(b.id)}</b></span>
              </Link>
              <div className="request-who">
                <strong className="clip">{b.name}</strong>
                <span className="request-contact">
                  <a href={`tel:${b.phone}`}>{b.phone}</a>
                  <a href={waCustomer(b)} target="_blank" rel="noopener" className="wa">WhatsApp</a>
                </span>
                <small className={ageHours(b) >= STALE_H ? 'age stale' : 'age'}>
                  Requested {ago(b)}{ageHours(b) >= STALE_H && ' · no deposit yet?'}
                </small>
              </div>
              <Actions b={b} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="admin-h">Schedule</h2>
      <div className="panel schedule">
        <HourBoard key={`${court}-${date}-${hour}`} slots={slots} query={new URLSearchParams({ court, date }).toString()}
          selected={hour} back={href({})} addAction={addBooking} courtLabel={COURTS[court]} court={court} date={date}
          detail={sel && (
            <>
              <p className="label">{fmtHour(hour)} - {fmtHour(hour + 1)} <span className={`status ${sel.status}`}>{sel.status === 'pending' ? 'Awaiting deposit' : 'Approved'}</span></p>
              <h3 className="clip">{sel.name}</h3>
              <dl>
                <dt>Phone</dt><dd><a href={`tel:${sel.phone}`}>{sel.phone}</a></dd>
                {sel.email && <><dt>Email</dt><dd className="clip"><a href={`mailto:${sel.email}`}>{sel.email}</a></dd></>}
                <dt>Code</dt><dd translate="no">{bookingRef(sel.id)}</dd>
                <dt>Requested</dt><dd>{stampFmt.format(new Date(sel.created_at))} <span className="muted">({ago(sel)})</span></dd>
              </dl>
              <Actions b={sel} />
              <a href={waCustomer(sel)} target="_blank" rel="noopener" className="btn ghost wa-btn">
                {sel.status === 'pending' ? 'Ask for deposit on WhatsApp' : 'Send confirmation on WhatsApp'}
              </a>
            </>
          )}>
          <nav className="seg" aria-label="Court">
            {Object.entries(COURTS).map(([k, label]) => (
              <Link key={k} href={`/admin?${new URLSearchParams({ court: k, date })}`} aria-current={court === k ? 'page' : undefined}>
                <Icon name={k} /> {label}
              </Link>
            ))}
          </nav>

          <div className="week-head">
            <p className="label">{longDate(date)}<small className="bs">{bs(date)}</small></p>
            <div className="week-nav">
              {date !== t && <Link className="today" href={href({ date: t })}>Today</Link>}
              <Link aria-label="Previous week" href={href({ date: addDays(start, -7) })}><span aria-hidden="true">←</span></Link>
              <Link aria-label="Next week" href={href({ date: addDays(start, 7) })}><span aria-hidden="true">→</span></Link>
            </div>
          </div>
          <nav className="days" aria-label="Day">
            {days.map((d) => (
              <Link key={d} href={href({ date: d })} aria-current={date === d ? 'page' : undefined} aria-label={`${longDate(d)} (${bs(d)})`}>
                <small>{d === t ? 'Today' : dayLabel(d, { weekday: 'short' })}</small>
                <strong>{dayLabel(d, { day: 'numeric' })}</strong>
                <small className="bs">{bs(d, bs(d, 'D') === '1' ? 'MMM D' : 'D')}</small>
              </Link>
            ))}
          </nav>
          <form className="other-day">
            <input type="hidden" name="court" value={court} />
            <label>Jump to date <input type="date" name="date" defaultValue={date} /></label>
            <button className="btn ghost small">Go</button>
          </form>

          <ul className="legend" aria-label="Legend">
            <li><span className="swatch free" /> Free</li>
            <li><span className="swatch pending" /> Pending</li>
            <li><span className="swatch approved" /> Approved</li>
          </ul>
        </HourBoard>
      </div>
    </section>
  );
}
