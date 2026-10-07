import Link from 'next/link';
import { sql } from '@/lib/db';
import { COURTS, rs, spans, bookingRef, waLink, waNumber } from '@/lib/config';
import { today, isDate, addDays, dayLabel, shortDay, stampFmt } from '@/lib/dates';
import { summarize, STATE } from '@/lib/money';
import { bs, billKey } from '@/lib/admin';
import Icon from '@/app/Icon';
import ConfirmButton from './ConfirmButton';
import Popup from './Popup';
import DayPicker from './DayPicker';
import PaymentForm from './PaymentForm';
import { recordPayment, unconfirmPayment, refund, removeEntry } from './payment-actions';

const KIND = { payment: 'Payment', discount: 'Discount', refund: 'Refund' };
const METHOD = { cash: 'Cash', qr: 'QR' };
// one bill line: "Deposit · QR", "Paid · Cash · regular", "Discount (10%) · regular", "Refunded · Cash"
const line = (e) => {
  const pct = e.kind === 'discount' && e.note?.match(/^[\d.]+%/)?.[0];
  const note = pct ? e.note.slice(pct.length).replace(/^ · /, '') : e.note === 'Deposit' ? '' : e.note;
  const name = e.kind === 'discount' ? `Discount${pct ? ` (${pct})` : ''}` : e.kind === 'refund' ? 'Refunded' : e.note === 'Deposit' ? 'Deposit' : 'Paid';
  return [name, METHOD[e.method], note].filter(Boolean).join(' · ');
};
const OPEN = ['unpaid', 'part', 'over', 'held']; // money still has to move
const SHOW = { open: 'Open', settled: 'Settled', all: 'All' };

// One day, Sunday-Saturday weeks (Nepal's week) or calendar months, AD. Totals are by booking date, not payment date.
const PERIODS = { day: 'Day', week: 'Week', month: 'Month' };
function range(period, date) {
  if (period === 'day') { // its week's strip of days, like the Bookings tab
    const sun = addDays(date, -new Date(`${date}T00:00Z`).getUTCDay());
    return { start: date, end: date, days: Array.from({ length: 7 }, (_, i) => addDays(sun, i)) };
  }
  if (period === 'week') {
    const start = addDays(date, -new Date(`${date}T00:00Z`).getUTCDay()), end = addDays(start, 6);
    const short = (d) => dayLabel(d, { month: 'short', day: 'numeric' });
    return { start, end, prev: addDays(start, -7), next: addDays(start, 7), label: `${short(start)} - ${short(end)}, ${end.slice(0, 4)}` };
  }
  const start = `${date.slice(0, 7)}-01`, next = `${addDays(start, 32).slice(0, 7)}-01`;
  return { start, end: addDays(next, -1), prev: `${addDays(start, -1).slice(0, 7)}-01`, next, label: dayLabel(start, { month: 'long', year: 'numeric' }) };
}

const codes = (b) => b.refs.map(bookingRef).join(', ');
const waBalance = (b, due) => waLink(waNumber(b.phone),
  `Hi ${b.name}, this is Match & Meals about your booking${b.refs.length > 1 ? 's' : ''} ${codes(b)} (${COURTS[b.court]}, ${shortDay(b.day)}). Please pay the remaining ${rs(due)} at the counter. Thank you!`);

export default async function Payments({ q }) {
  const period = PERIODS[q.period] ? q.period : 'week';
  const t = today();
  const date = isDate(q.date) ? q.date : t;
  const show = SHOW[q.show] ? q.show : 'open';
  const court = COURTS[q.court] ? q.court : 'all';
  const { start, end, prev, next, label, days } = range(period, date);
  const keep = { tab: 'payments', period, show, ...(court !== 'all' && { court }) }; // the view's params, minus the date
  const href = (o) => {
    const p = new URLSearchParams({ ...keep, date, ...o });
    if (p.get('court') === 'all') p.delete('court');
    return `/admin?${p}`;
  };

  // pending requests haven't paid anything yet: they stay on the Bookings tab
  const byRef = await sql`
    select coalesce(ref, id) as ref, min(court) as court, min(date)::text as day, min(name) as name, min(phone) as phone,
      coalesce(array_agg(hour order by hour) filter (where status <> 'cancelled'), array_agg(hour order by hour)) as hours,
      coalesce(sum(rate) filter (where status <> 'cancelled'), 0)::int as total
    from bookings where date between ${start} and ${end} and status <> 'pending' and (${court} = 'all' or court = ${court})
    group by coalesce(ref, id) order by day, min(hour)`;
  // one row per bill: the same customer's bookings on one court and day are paid together (see moneyFor)
  const rows = Object.values(byRef.reduce((o, b) => ((o[billKey(b)] ??= []).push(b), o), {})).map((g) => {
    const live = g.filter((b) => b.total); // fully cancelled bookings only add their hours if nothing else is left
    return {
      ...g[0], ref: Math.min(...g.map((b) => b.ref)), refs: g.map((b) => b.ref).sort((a, b) => a - b),
      hours: [...new Set((live.length ? live : g).flatMap((b) => b.hours))].sort((a, b) => a - b),
      total: g.reduce((s, b) => s + b.total, 0),
    };
  });
  const entries = rows.length
    ? await sql`select * from payments where ref = any(${byRef.map((r) => r.ref)}::int[]) order by created_at` : [];
  const all = rows.map((b) => {
    const mine = entries.filter((e) => b.refs.includes(e.ref));
    return { ...b, entries: mine, m: summarize(b, mine) };
  }).filter((b) => b.m.state !== 'cancelled'); // cancelled with no money left on it: nothing to track

  const sum = (f) => all.reduce((s, b) => s + f(b.m), 0);
  const held = sum((m) => m.held);
  const list = all.filter((b) => show === 'all' || OPEN.includes(b.m.state) === (show === 'open'));
  const backFor = (ref) => `${href({})}#pay-${ref}`; // after an action, land back on the row
  const Back = ({ to }) => <input type="hidden" name="back" value={backFor(to)} />;
  const Method = () => (
    <select name="method" aria-label="Method" defaultValue="cash"><option value="cash">Cash</option><option value="qr">QR</option></select>
  );

  return (
    <>
      <div className="pay-period">
        <nav className="seg three" aria-label="Period">
          {Object.entries(PERIODS).map(([k, l]) => (
            <Link key={k} href={href({ period: k })} aria-current={period === k ? 'page' : undefined}>{l}</Link>
          ))}
        </nav>
        {period === 'day' ? (
          <DayPicker date={date} t={t} days={days} link={(d) => href({ date: d })} keep={keep} />
        ) : (
          <div className="week-head">
            <p className="label">{label}<small className="bs">{bs(start, 'D MMM')} - {bs(end, 'D MMM YYYY')}</small></p>
            <div className="week-nav">
              {(t < start || t > end) && <Link className="today" href={href({ date: t })}>Today</Link>}
              <Link aria-label={`Previous ${period}`} href={href({ date: prev })}><span aria-hidden="true">←</span></Link>
              <Link aria-label={`Next ${period}`} href={href({ date: next })}><span aria-hidden="true">→</span></Link>
            </div>
          </div>
        )}
      </div>

      <nav className="seg three pay-court" aria-label="Court">
        {Object.entries({ all: 'All Courts', ...COURTS }).map(([k, l]) => (
          <Link key={k} href={href({ court: k })} aria-current={court === k ? 'page' : undefined}>
            {k !== 'all' && <Icon name={k} />} {l}
          </Link>
        ))}
      </nav>

      <dl className="pay-totals">
        <div><dt>Billed</dt><dd>{rs(sum((m) => m.total))}</dd></div>
        <div><dt>Discounts</dt><dd>{rs(sum((m) => m.discount))}</dd></div>
        <div><dt>Collected</dt><dd>{rs(sum((m) => m.paid))}</dd></div>
        <div><dt>To collect</dt><dd>{rs(sum((m) => Math.max(0, m.due)))}</dd></div>
        {held > 0 && <div className="held"><dt>Held from cancellations</dt><dd>{rs(held)}</dd></div>}
      </dl>
      <p className="muted pay-basis">By booking date. Collected includes deposits held on cancelled bookings.</p>

      <nav className="chips" aria-label="Show">
        {Object.entries(SHOW).map(([k, l]) => (
          <Link key={k} href={href({ show: k })} aria-current={show === k ? 'page' : undefined}>{l}</Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <p className="empty">{all.length ? 'Nothing here. Try another filter.' : `No approved bookings ${period === 'day' ? 'on this day' : `in this ${period}`}.`}</p>
      ) : (
        <ul className="requests">
          {list.map((b) => {
            const { m } = b, refundable = Math.max(m.held, -m.due);
            const pct = b.entries.find((e) => e.kind === 'discount')?.note?.match(/^[\d.]+%/)?.[0]; // see recordPayment
            const lastPaid = b.entries.findLast((e) => e.kind === 'payment'); // what Unconfirm Payment removes
            return (
              <li key={b.ref} id={`pay-${b.ref}`} className="request pay-row">
                <Link href={`/admin?${new URLSearchParams({ court: b.court, date: b.day, hour: b.hours[0] })}#detail`} className="request-when">
                  <strong>{shortDay(b.day)}, {spans(b.hours)} <small className="bs">{bs(b.day, 'D MMMM')}</small></strong>
                  <span><Icon name={b.court} /> {COURTS[b.court]} · <b translate="no">{codes(b)}</b></span>
                </Link>
                <div className="request-who">
                  <strong className="clip">{b.name}</strong>
                  <span className="request-contact">
                    <a href={`tel:${b.phone}`}>{b.phone}</a>
                    {m.due > 0 && <a href={waBalance(b, m.due)} target="_blank" rel="noopener" className="wa">WhatsApp</a>}
                  </span>
                </div>
                <div className="pay-money">
                  <span className={`status ${m.state}`}>{STATE[m.state]}{m.state === 'held' && ` · ${rs(m.held)} held`}</span>
                  {m.total > 0 && (m.due > 0 ? (
                    <Popup className="btn small" label="Record Payment" title="Record Payment">
                      <p><b translate="no">{codes(b)}</b> · {b.name}</p>
                      <PaymentForm action={recordPayment} back={backFor(b.ref)} bookingRef={b.ref} total={m.total} paid={m.paid}
                        discount={pct ? pct.slice(0, -1) : m.discount ? String(m.discount) : ''} pct={!!pct} />
                    </Popup>
                  ) : lastPaid && (
                    <form action={unconfirmPayment}>
                      <Back to={b.ref} /><input type="hidden" name="ref" value={b.ref} />
                      <ConfirmButton className="btn small ghost danger"
                        message={`Unconfirm the ${rs(lastPaid.amount)} payment on ${bookingRef(b.ref)}? It goes back to due.`}>Unconfirm Payment</ConfirmButton>
                    </form>
                  ))}
                </div>

                {/* the price breakdown, always shown: total, each deduction (✕ undoes a mistyped one), what's left */}
                <ul className="pay-bill">
                  <li><span>Total{!m.total && ' (cancelled)'}</span><b>{rs(m.total)}</b></li>
                  {b.entries.map((e) => (
                    <li key={e.id} title={stampFmt.format(new Date(e.created_at))}>
                      <span className="clip">{line(e)}</span>
                      <b>{e.kind === 'refund' ? '+' : '−'}{rs(e.amount)}</b>
                      <form action={removeEntry}>
                        <Back to={b.ref} /><input type="hidden" name="id" value={e.id} />
                        <ConfirmButton className="x" aria-label={`Remove ${line(e)}, ${rs(e.amount)}`}
                          message={`Remove this ${rs(e.amount)} ${e.kind} from ${bookingRef(b.ref)}?`}>✕</ConfirmButton>
                      </form>
                    </li>
                  ))}
                  <li className="payable">
                    <span>{!m.total ? 'Held' : m.due < 0 ? 'Owe back' : 'Total payable'}</span><b>{rs(!m.total ? m.held : Math.abs(m.due))}</b>
                  </li>
                </ul>
                {refundable > 0 && (
                  <form action={refund} className="pay-form" autoComplete="off">
                    <Back to={b.ref} /><input type="hidden" name="ref" value={b.ref} />
                    <label>Refund (Rs)<input name="amount" inputMode="numeric" required defaultValue={refundable} /></label>
                    <Method />
                    <input name="note" maxLength={200} placeholder="Note (optional)…" aria-label="Note" />
                    <ConfirmButton className="btn ghost small" message={`Record a refund on ${bookingRef(b.ref)}?`}>Refund</ConfirmButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
