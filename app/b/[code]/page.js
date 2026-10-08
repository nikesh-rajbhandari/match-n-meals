import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { moneyFor } from '@/lib/admin';
import { COURTS, DEPOSIT, PAY_QR, WHATSAPP, rs, spans, bookingRef, waLink } from '@/lib/config';
import { longDate } from '@/lib/dates';

// Public booking status: /b/MNM-97 (the code customers get). Codes are sequential, so anyone can guess one: show only the
// court, time, status and what's left to pay. Never the name or phone.
export const metadata = { title: 'Your Booking | Match & Meals', robots: { index: false, follow: false } };

const STATUS = {
  pending: ['Awaiting deposit', `Your time is on hold. Pay the ${rs(DEPOSIT)} deposit and send us the screenshot to confirm it.`],
  approved: ['Confirmed', 'You’re booked. See you on court.'],
  cancelled: ['Cancelled', 'This booking was cancelled. Message us if that’s a surprise.'],
  rejected: ['Not confirmed', 'We couldn’t confirm this request. Pick another time, or message us.'],
  no_show: ['Missed', 'This booking ended without you. Message us if that’s wrong.'],
};

export default async function BookingStatus({ params }) {
  const { code } = await params;
  const ref = Number(decodeURIComponent(code).replace(/^mnm-/i, ''));
  if (!Number.isInteger(ref) || ref <= 0) notFound();
  const rows = await sql`select court, date::text as day, hour, status from bookings
    where coalesce(ref, id) = ${ref} and status in ('pending', 'approved', 'cancelled', 'rejected', 'no_show') order by hour`;
  if (!rows.length) notFound();
  // hours still on (pending/approved) win; a booking with every hour called off shows how it ended
  const live = rows.filter((r) => r.status === 'pending' || r.status === 'approved');
  const shown = live.length ? live : rows;
  const { court, day, status } = shown[0];
  const [label, note] = STATUS[status];
  const money = status === 'approved' ? await moneyFor(ref) : null;
  const wa = WHATSAPP && waLink(WHATSAPP, `Hi Match & Meals, about my booking ${bookingRef(ref)} (${COURTS[court]}, ${longDate(day)}).`);

  return (
    <section className="section narrow">
      <h1>Booking <span translate="no">{bookingRef(ref)}</span></h1>
      <div className="panel booking-status">
        <p><span className={`status ${status}`}>{label}</span></p>
        <p>{note}</p>
        <dl>
          <dt>Court</dt><dd>{COURTS[court]}</dd>
          <dt>When</dt><dd>{longDate(day)}, {spans(shown.map((r) => r.hour))}</dd>
          {status === 'pending' && <><dt>Deposit</dt><dd>{rs(DEPOSIT)}</dd></>}
          {money && <><dt>{money.due > 0 ? 'To pay at the counter' : 'Payment'}</dt><dd>{money.due > 0 ? rs(money.due) : 'Fully paid'}</dd></>}
        </dl>
        {status === 'pending' && PAY_QR && (
          <img src={PAY_QR} alt={`Payment QR for the ${rs(DEPOSIT)} deposit`} width="200" height="200" className="qr" />
        )}
        <div className="actions">
          {wa && <a className="btn" href={wa} target="_blank" rel="noopener">Message Us on WhatsApp</a>}
          <Link className="btn ghost" href="/#book">Book Another Time</Link>
        </div>
      </div>
    </section>
  );
}
