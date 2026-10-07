import Link from 'next/link';
import { addDays, dayLabel, longDate } from '@/lib/dates';
import { bs } from '@/lib/admin';

// Day header, week arrows, 7-day strip and "Jump to date"; shared by the Bookings and Payments tabs.
// link(date) builds a day's URL; `keep` holds the other URL params the jump form has to carry along.
export default function DayPicker({ date, t, days, link, keep }) {
  return (
    <>
      <div className="week-head">
        <p className="label">{longDate(date)}<small className="bs">{bs(date)}</small></p>
        <div className="week-nav">
          {date !== t && <Link className="today" href={link(t)}>Today</Link>}
          <Link aria-label="Previous week" href={link(addDays(days[0], -7))}><span aria-hidden="true">←</span></Link>
          <Link aria-label="Next week" href={link(addDays(days[0], 7))}><span aria-hidden="true">→</span></Link>
        </div>
      </div>
      <nav className="days" aria-label="Day">
        {days.map((d) => (
          <Link key={d} href={link(d)} aria-current={date === d ? 'page' : undefined} aria-label={`${longDate(d)} (${bs(d)})`}>
            <small>{d === t ? 'Today' : dayLabel(d, { weekday: 'short' })}</small>
            <strong>{dayLabel(d, { day: 'numeric' })}</strong>
            <small className="bs">{bs(d, bs(d, 'D') === '1' ? 'MMM D' : 'D')}</small>
          </Link>
        ))}
      </nav>
      <form className="other-day">
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label>Jump to date <input type="date" name="date" defaultValue={date} /></label>
        <button className="btn ghost small">Go</button>
      </form>
    </>
  );
}
