import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql, log } from '@/lib/db';
import { notifyAdmins } from '@/lib/push';
import { COURTS, OPEN_HOUR, CLOSE_HOUR, TZ, DEPOSIT, RATE, hours, fmtHour, rs, spans, bookingRef, waLink, waNumber } from '@/lib/config';
import { today, hourNow, isDate, addDays, shortDay, stampFmt, weekOf } from '@/lib/dates';
import { parseRs, STATE } from '@/lib/money';
import Icon from '@/app/Icon';
import { isAdmin, logIn, endSession, backTo, bs, moneyFor } from '@/lib/admin';
import Payments from './Payments';
import DayPicker from './DayPicker';
import ConfirmButton from './ConfirmButton';
import Notifications from './Notifications';
import Notice from './Notice';
import HourBoard from './HourBoard';
import Popup from './Popup';
import MoveForm from './MoveForm';
import Refresher from './Refresher';
import PasswordInput from './PasswordInput';
import Staff from './Staff';
import History from './History';
import SubmitButton from './SubmitButton';

export const dynamic = 'force-dynamic';

// Installable as its own app (home screen, standalone window); the manifest's scope is /admin only.
export const metadata = {
  title: 'Admin | Match & Meals',
  manifest: '/admin.webmanifest',
  icons: { apple: '/icons/apple-touch.png' },
  appleWebApp: { capable: true, title: 'M&M Admin', statusBarStyle: 'default' },
};

const fail = (msg) => redirect(`/admin?${new URLSearchParams({ bad: msg })}`);

async function login(form) {
  'use server';
  const error = await logIn(form.get('username'), form.get('password'));
  if (error) fail(error);
  revalidatePath('/admin');
  redirect('/admin');
}

async function logout() {
  'use server';
  await endSession();
  revalidatePath('/admin');
}

// Approves every hour booked together. Deposits vary, so staff type in what the WhatsApp screenshot shows (or leave it blank).
async function approve(form) {
  'use server';
  const me = await isAdmin();
  if (!me) return;
  const deposit = String(form.get('deposit') ?? '').trim(), amount = parseRs(deposit);
  if (deposit && !amount) redirect(backTo(form, 'Enter the deposit in whole rupees, or leave it blank', true));
  const rows = await sql`update bookings set status = 'approved', approved_by = ${me.name}, approved_at = now()
    where status = 'pending' and coalesce(ref, id) = (select coalesce(ref, id) from bookings where id = ${Number(form.get('id'))})
    returning coalesce(ref, id) as ref, name, hour`;
  if (rows.length && amount) {
    await sql`insert into payments (ref, kind, amount, method, note, created_by) values (${rows[0].ref}, 'payment', ${amount}, 'qr', 'Deposit', ${me.name})`;
  }
  if (rows.length) await log(me.name, rows[0].ref, `Approved${amount ? ` · ${rs(amount)} deposit (QR)` : ' · no deposit recorded'}`);
  revalidatePath('/admin');
  redirect(backTo(form, rows.length && `Approved ${rows[0].name}, ${spans(rows.map((r) => r.hour).sort((a, b) => a - b))}${amount ? `. Deposit ${rs(amount)} recorded.` : ''}`));
}

// Reject (pending -> rejected) and cancel (approved -> cancelled) free the slot. The row stays, with who and when, and
// shows in the list below the schedule for its day; money paid on it stays on the Payments tab.
async function cancel(form) {
  'use server';
  const me = await isAdmin();
  if (!me) return;
  const [b] = await sql`update bookings b set status = case when b.status = 'pending' then 'rejected' else 'cancelled' end,
      changed_by = ${me.name}, changed_at = now()
    where id = ${Number(form.get('id'))} and status in ('pending', 'approved')
    returning name, hour, status, coalesce(ref, id) as ref,
      exists (select 1 from payments p where p.ref = coalesce(b.ref, b.id) and p.voided_at is null) as paid`;
  if (b) await log(me.name, b.ref, `${b.status === 'rejected' ? 'Rejected' : 'Cancelled'} ${fmtHour(b.hour)}`);
  revalidatePath('/admin');
  redirect(backTo(form, b && `${b.status === 'rejected' ? 'Rejected' : 'Cancelled'} ${b.name}, ${fmtHour(b.hour)}. The slot is free again.${b.paid ? ' The money paid stays on the Payments tab.' : ''}`));
}

// Change Date / Time: moves one booked hour that hasn't ended to a free hour that hasn't started, on the same court.
// It keeps its code and payments, unless it leaves other hours of its booking behind for another day: then it becomes its
// own booking (new code), so one code never spans two days. The unique slot index refuses an hour someone just took.
async function move(form) {
  'use server';
  const me = await isAdmin();
  if (!me) return;
  const id = Number(form.get('id')), date = String(form.get('date') ?? ''), hour = Number(form.get('hour')), t = today();
  let msg, err = true;
  if (!isDate(date) || !hours().includes(hour) || date < t || (date === t && hour < hourNow())) msg = 'Pick a time that hasn’t started yet';
  else {
    try {
      const [b] = await sql`with o as (select id, date::text as day, hour, coalesce(ref, id) as ref from bookings where id = ${id})
        update bookings b set date = ${date}, hour = ${hour}, changed_by = ${me.name}, changed_at = now(),
          ref = case when b.date <> ${date}::date and exists (select 1 from bookings o where coalesce(o.ref, o.id) = coalesce(b.ref, b.id) and o.id <> b.id)
            then case when b.id <> coalesce(b.ref, b.id) then b.id else nextval(pg_get_serial_sequence('bookings', 'id')) end
            else b.ref end
        from o where b.id = o.id and b.status in ('pending', 'approved') and b.date + (b.hour + 1) * interval '1 hour' > now() at time zone ${TZ}
        returning b.name, b.court, coalesce(b.ref, b.id) as ref, o.day as from_day, o.hour as from_hour, o.ref as from_ref`;
      if (!b) msg = 'That booking has already ended or was cancelled';
      else {
        const moved = `Moved ${shortDay(b.from_day)}, ${fmtHour(b.from_hour)} → ${shortDay(date)}, ${fmtHour(hour)}`;
        await log(me.name, b.ref, b.ref === b.from_ref ? moved : `${moved} · split off ${bookingRef(b.from_ref)} as a new code`);
        if (b.ref !== b.from_ref) await log(me.name, b.from_ref, `${moved} · that hour is now ${bookingRef(b.ref)}`);
        msg = `Moved ${b.name} to ${shortDay(date)}, ${fmtHour(hour)} (${bookingRef(b.ref)}). Let them know on WhatsApp.`; err = false;
        form.set('back', `/admin?${new URLSearchParams({ court: b.court, date, hour })}#detail`); // land on the new slot
      }
    } catch (e) {
      if (e.code !== '23505') throw e;
      msg = 'That hour was just taken. Pick another.';
    }
  }
  revalidatePath('/admin');
  redirect(backTo(form, msg, err));
}

// One day's hours as one group (one code), all or nothing: the slot index refuses an hour that's taken or blocked.
// Returns the group's ref, or null if any hour was taken.
async function insertGroup(row, date, picked) {
  try {
    const rows = await sql`insert into bookings (court, date, hour, rate, name, phone, status, created_by)
      select ${row.court}, ${date}, h, ${row.rate}, ${row.name}, ${row.phone}, ${row.status}, ${row.who}
      from unnest(${picked}::int[]) h returning id`;
    const ids = rows.map((r) => r.id), ref = Math.min(...ids);
    await sql`update bookings set ref = ${ref} where id = any(${ids}::int[])`.catch((e) => console.error('booking ref not set', ids, e.message));
    return ref;
  } catch (e) {
    if (e.code !== '23505') throw e;
    return null;
  }
}

// The add form under the schedule: a walk-in / phone booking (approved straight away) or a block (maintenance, events:
// customers can't book it), on one day or the same hours every week for up to 4 weeks (regulars). Each week is its own
// code and bill; weeks where an hour is already taken are skipped and named in the message.
async function addBooking(form) {
  'use server';
  const me = await isAdmin();
  if (!me) return;
  const f = Object.fromEntries(form), block = f.mode === 'block';
  if (block && me.role !== 'owner') redirect(backTo(form, 'Only owners can block hours', true));
  const picked = [...new Set(form.getAll('hours').map(Number))].sort((a, b) => a - b); // ticked 1-hour blocks
  const name = String(f.name ?? '').trim(), phone = block ? '' : String(f.phone ?? '').trim();
  const weeks = Math.min(4, Math.max(1, Math.floor(Number(f.weeks)) || 1));

  let msg, err = true;
  if (!COURTS[f.court] || !isDate(f.date)) msg = 'Pick a court and a date';
  else if (!picked.length) msg = 'Pick at least one hour';
  else if (!picked.every((h) => Number.isInteger(h) && h >= OPEN_HOUR && h < CLOSE_HOUR))
    msg = `Times must fall between ${fmtHour(OPEN_HOUR)} and ${fmtHour(CLOSE_HOUR)}`;
  else if (block && (!name || name.length > 100)) msg = 'Enter a reason for the block, e.g. Maintenance';
  else if (!block && (!name || name.length > 100 || !phone || phone.length > 20)) msg = 'Enter the customer’s name and phone number';
  else {
    const row = { court: f.court, name, phone, status: block ? 'blocked' : 'approved', rate: block ? 0 : RATE, who: me.name };
    const made = [], missed = [];
    for (let w = 0; w < weeks; w++) {
      const d = addDays(f.date, 7 * w), ref = await insertGroup(row, d, picked);
      if (!ref) { missed.push(d); continue; }
      made.push(ref);
      await log(me.name, ref, `${block ? `Blocked · ${name}` : 'Booked at the counter'} · ${COURTS[f.court]}, ${spans(picked)}${weeks > 1 ? ` · weekly, ${w + 1} of ${weeks}` : ''}`);
    }
    if (!made.length) msg = weeks > 1 ? 'Those hours are taken in every one of those weeks. Pick different hours.' : 'One of those hours was just taken. Pick a different hour.';
    else {
      err = false;
      msg = `${block ? 'Blocked' : `Booked ${name},`} ${spans(picked)}${weeks > 1 ? ` for ${made.length} of ${weeks} weeks` : ''}`
        + (missed.length ? `. Skipped (already taken): ${missed.map(shortDay).join(', ')}` : '');
      // tell the other admins' devices about new bookings; this one already knows
      if (!block) after(() => notifyAdmins({
        title: `Booked by ${me.name}: ${COURTS[f.court]}, ${spans(picked)}`,
        body: `${name} · ${shortDay(f.date)}${weeks > 1 ? `, weekly x${made.length}` : ''}`,
        url: `/admin?${new URLSearchParams({ court: f.court, date: f.date, hour: picked[0] })}#detail`,
      }, String(f.push ?? '')));
    }
  }
  revalidatePath('/admin');
  redirect(backTo(form, msg, err));
}

// Reopens a whole block (every hour blocked together). The row stays as 'unblocked', with who and when.
async function unblock(form) {
  'use server';
  const me = await isAdmin();
  if (me?.role !== 'owner') return;
  const rows = await sql`update bookings set status = 'unblocked', changed_by = ${me.name}, changed_at = now()
    where status = 'blocked' and coalesce(ref, id) = (select coalesce(ref, id) from bookings where id = ${Number(form.get('id'))})
    returning coalesce(ref, id) as ref, hour, name`;
  const when = rows.length && spans(rows.map((r) => r.hour).sort((a, b) => a - b));
  if (rows.length) await log(me.name, rows[0].ref, `Unblocked · ${rows[0].name}, ${when}`);
  revalidatePath('/admin');
  redirect(backTo(form, rows.length && `Unblocked ${when}. Customers can book it again.`));
}

// "12 min ago" / "3 h ago" / "2 d ago"; requests older than STALE_H get a nudge (we can't know if the screenshot was sent)
const STALE_H = 2;
const ageHours = (b) => (Date.now() - new Date(b.created_at)) / 36e5;
const ago = (b) => {
  const m = Math.max(1, Math.round(ageHours(b) * 60));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

// One-tap WhatsApp to the customer from the admin app (it runs on the admin's phone, where WhatsApp is).
// `due` = the whole booking's balance (all its hours, minus discount and payments); pending requests don't need it.
// `site` = this site's origin, for the booking status link (/b/MNM-97) the customer can check any time.
const waCustomer = (b, due, site) => {
  const when = `${COURTS[b.court]}, ${shortDay(b.day)}, ${fmtHour(b.hour)}`;
  const status = `Check it any time: ${site}/b/${bookingRef(b.ref ?? b.id)}`;
  const text = b.status === 'pending'
    ? `Hi ${b.name}, this is Match & Meals about your booking ${bookingRef(b.ref ?? b.id)} (${when}). Please pay the ${rs(DEPOSIT)} deposit and send the screenshot here to confirm it. ${status}`
    : `Hi ${b.name}, your booking ${bookingRef(b.ref ?? b.id)} is confirmed: ${when}. ${due > 0 ? `Please pay the remaining ${rs(due)} at the counter.` : 'It’s fully paid.'} See you! ${status}`;
  return waLink(waNumber(b.phone), text);
};

export default async function Admin({ searchParams }) {
  const q = await searchParams;
  const me = await isAdmin();
  const h = await headers(), site = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  if (!me) {
    const err = q.bad ? { 'aria-describedby': 'login-err' } : {};
    return (
      <section className="section login">
        <div className="panel">
          <h1>Admin</h1>
          <form action={login} className="form">
            {/* autoFocus: the first field of the only form on the page */}
            <label htmlFor="username">Username</label>
            <input id="username" name="username" required autoFocus autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} {...err} />
            <label htmlFor="password">Password</label>
            <PasswordInput id="password" name="password" required autoComplete="current-password" {...err} />
            {q.bad && <p className="err" id="login-err" role="alert">{q.bad}</p>}
            <SubmitButton className="btn big" pendingLabel="Logging In…">Log In</SubmitButton>
            <p className="muted hint">Forgot your password? Ask an owner to reset it from the Staff tab.</p>
          </form>
        </div>
      </section>
    );
  }

  const head = (tab) => (
    <>
      <div className="admin-head">
        <div className="who">
          <h1>Admin</h1>
          <small className="muted clip">Logged in as {me.name}</small>
        </div>
        <div className="admin-tools">
          <Refresher />
          <Notifications />
          <form action={logout}>
            <button className="icon-btn logout" aria-label="Log out" title="Log out"><Icon name="logout" /></button>
          </form>
        </div>
      </div>
      <nav className={`seg admin-tabs${me.role === 'owner' ? ' three' : ''}`} aria-label="Section">
        <Link href="/admin" aria-current={tab === 'bookings' ? 'page' : undefined}>Bookings</Link>
        <Link href="/admin?tab=payments" aria-current={tab === 'payments' ? 'page' : undefined}>Payments</Link>
        {me.role === 'owner' && <Link href="/admin?tab=staff" aria-current={tab === 'staff' ? 'page' : undefined}>Staff</Link>}
      </nav>
      {(q.msg || q.err) && <Notice key={q.msg || q.err} text={q.msg || q.err} error={!!q.err} />}
    </>
  );
  if (q.tab === 'staff' && me.role === 'owner') return <section className="section admin">{head('staff')}<Staff me={me} /></section>;
  if (q.tab === 'payments') return <section className="section admin">{head('payments')}<Payments q={q} owner={me.role === 'owner'} /></section>;

  // view state lives in the URL: ?court=&date=&hour=
  const t = today();
  const court = COURTS[q.court] ? q.court : 'pickleball';
  const date = isDate(q.date) ? q.date : t;
  const hour = hours().includes(Number(q.hour)) ? Number(q.hour) : null;
  const href = (o) => `/admin?${new URLSearchParams({ court, date, ...o })}`;
  const here = href(hour === null ? {} : { hour });

  const [pending, all] = await Promise.all([
    sql`select *, date::text as day from bookings
        where status = 'pending' and date + (hour + 1) * interval '1 hour' > now() at time zone ${TZ}
        order by date, hour, court`,
    sql`select *, date::text as day from bookings where court = ${court} and date = ${date} order by hour, changed_at`,
  ]);
  const GONE = { cancelled: 'Cancelled', rejected: 'Rejected', no_show: 'No-show', unblocked: 'Unblocked' }; // kept for the record, slot is free
  const gone = all.filter((b) => GONE[b.status]);
  const day = all.filter((b) => ['pending', 'approved', 'blocked'].includes(b.status));
  const byHour = Object.fromEntries(day.map((b) => [b.hour, b]));
  const sel = hour === null ? null : byHour[hour] ?? null;
  const money = sel?.status === 'approved' ? await moneyFor(sel.ref ?? sel.id) : null;
  const owner = me.role === 'owner'; // owners also see each booking's History, and can block / unblock hours
  const history = sel && owner ? await sql`select * from activity where ref = any(${money?.refs ?? [sel.ref ?? sel.id]}::int[]) order by at, id` : [];
  const { days } = weekOf(t, date);
  const nowHour = date === t ? hourNow() : date < t ? 99 : -1; // hours before this have already started
  // each booking shows its code; every other booking of the day gets a stripe, so the same customer's back-to-back bookings
  // don't read as one
  const order = [...new Set(day.toSorted((a, b) => a.hour - b.hour).map((b) => b.ref ?? b.id))];
  const slots = hours().map((h) => {
    const b = byHour[h], ref = b && (b.ref ?? b.id);
    return { h, state: b?.status ?? 'free', name: b?.name ?? null, code: b && b.status !== 'blocked' ? bookingRef(ref) : null, alt: !!b && order.indexOf(ref) % 2 === 1, past: h < nowHour };
  });

  const Back = () => <input type="hidden" name="back" value={here} />;
  const Actions = ({ b }) => (
    <div className="actions">
      {b.status === 'pending' && (
        <form action={approve} className="approve" autoComplete="off">
          <Back /><input type="hidden" name="id" value={b.id} />
          <input name="deposit" inputMode="numeric" placeholder="Deposit Rs" aria-label="Deposit received in rupees (optional)" />
          <button className="btn">Approve</button>
        </form>
      )}
      <form action={cancel}>
        <Back /><input type="hidden" name="id" value={b.id} />
        <ConfirmButton className="btn ghost danger"
          message={`${b.status === 'pending' ? 'Reject' : 'Cancel'} ${b.name}’s ${fmtHour(b.hour)} booking on ${shortDay(b.day)}? This frees the slot. It stays listed below the schedule.`}>
          {b.status === 'pending' ? 'Reject' : 'Cancel'}
        </ConfirmButton>
      </form>
    </div>
  );

  return (
    <section className="section admin">
      {head('bookings')}

      <h2 className="admin-h">Needs Approval {pending.length > 0 && <b className="count">{pending.length}</b>}</h2>
      {pending.length === 0 ? (
        <p className="empty">All caught up. New requests from the website show up here.</p>
      ) : (
        <ul className="requests">
          {pending.map((b) => (
            <li key={b.id} className="request">
              <Link href={`/admin?${new URLSearchParams({ court: b.court, date: b.day, hour: b.hour })}#detail`} className="request-when">
                <strong>{shortDay(b.day)}, {fmtHour(b.hour)} <small className="bs">{bs(b.day, 'D MMMM')}</small></strong>
                <span><Icon name={b.court} /> {COURTS[b.court]} · <b translate="no">{bookingRef(b.ref ?? b.id)}</b></span>
              </Link>
              <div className="request-who">
                <strong className="clip">{b.name}</strong>
                <span className="request-contact">
                  <a href={`tel:${b.phone}`}>{b.phone}</a>
                  <a href={waCustomer(b, 0, site)} target="_blank" rel="noopener" className="wa">WhatsApp</a>
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
          selected={hour} back={href({})} addAction={addBooking} canBlock={owner} courtLabel={COURTS[court]} court={court} date={date}
          detail={sel?.status === 'blocked' ? (
            <>
              <p className="label">{fmtHour(hour)} - {fmtHour(hour + 1)} <span className="status blocked">Blocked</span></p>
              <h3 className="clip">{sel.name}</h3>
              <dl>
                <dt>Blocked</dt><dd>{stampFmt.format(new Date(sel.created_at))} <span className="muted">by {sel.created_by}</span></dd>
              </dl>
              <p className="muted">Customers see this hour as Closed.{!owner && ' Ask an owner to unblock it.'}</p>
              <History entries={history} />
              {owner && (
                <form action={unblock} className="actions">
                  <Back /><input type="hidden" name="id" value={sel.id} />
                  <ConfirmButton className="btn ghost" message={`Unblock ${sel.name} on ${shortDay(sel.day)}? Every hour blocked with it opens for booking again.`}>Unblock</ConfirmButton>
                </form>
              )}
            </>
          ) : sel && (
            <>
              <p className="label">{fmtHour(hour)} - {fmtHour(hour + 1)} <span className={`status ${sel.status}`}>{sel.status === 'pending' ? 'Awaiting deposit' : 'Approved'}</span></p>
              <h3 className="clip">{sel.name}</h3>
              <dl>
                <dt>Phone</dt><dd><a href={`tel:${sel.phone}`}>{sel.phone}</a></dd>
                <dt>Code</dt><dd translate="no">{bookingRef(sel.ref ?? sel.id)}</dd>
                {money && <><dt>Payment</dt><dd>
                  <Link href={`/admin?${new URLSearchParams({ tab: 'payments', date: sel.day, show: 'all' })}`}>{STATE[money.state]}</Link>
                  {money.due > 0 && <span className="muted"> · due {rs(money.due)}</span>}
                </dd></>}
                <dt>{sel.created_by ? 'Booked' : 'Requested'}</dt>
                <dd>{stampFmt.format(new Date(sel.created_at))} <span className="muted">({ago(sel)}) {sel.created_by ? `by ${sel.created_by}` : 'on the website'}</span></dd>
                {sel.approved_by && <><dt>Approved</dt><dd>{stampFmt.format(new Date(sel.approved_at))} <span className="muted">by {sel.approved_by}</span></dd></>}
                {sel.changed_by && <><dt>Last changed</dt><dd>{stampFmt.format(new Date(sel.changed_at))} <span className="muted">by {sel.changed_by}</span></dd></>}
              </dl>
              <History entries={history} />
              <Actions b={sel} />
              {hour >= nowHour && (
                <Popup className="btn ghost wa-btn" label="Change Date / Time" title="Change Date / Time">
                  <p>{sel.name} · {shortDay(sel.day)}, {fmtHour(hour)} · <b translate="no">{bookingRef(sel.ref ?? sel.id)}</b></p>
                  <MoveForm action={move} back={`${here}#detail`} id={sel.id} court={court} date={date} hour={hour} t={t} now={hourNow()} />
                </Popup>
              )}
              <a href={waCustomer(sel, money?.due, site)} target="_blank" rel="noopener" className="btn ghost wa-btn">
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

          <DayPicker date={date} t={t} days={days} link={(d) => href({ date: d })} keep={{ court }} />

          <ul className="legend" aria-label="Legend">
            <li><span className="swatch free" /> Free</li>
            <li><span className="swatch pending" /> Pending</li>
            <li><span className="swatch approved" /> Approved</li>
            <li><span className="swatch blocked" /> Blocked</li>
          </ul>
        </HourBoard>
      </div>

      {gone.length > 0 && (
        <>
          <h2 className="admin-h">Cancelled, Rejected &amp; No-shows <small className="muted">{COURTS[court]}, {shortDay(date)}</small></h2>
          <ul className="gone">
            {gone.map((b) => (
              <li key={b.id}>
                <strong>{fmtHour(b.hour)}</strong>
                <span className="clip">{b.name}{b.phone && <> · <a href={`tel:${b.phone}`}>{b.phone}</a> · <b translate="no">{bookingRef(b.ref ?? b.id)}</b></>}</span>
                <small className="muted">
                  {GONE[b.status]}{b.changed_by && ` by ${b.changed_by}`}
                  {b.changed_at && `, ${stampFmt.format(new Date(b.changed_at))}`}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
