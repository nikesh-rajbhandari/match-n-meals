'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fmtHour } from '@/lib/config';

// 13 -> "1 - 2 PM"; AM/PM shown once unless the block crosses noon ("11 AM - 12 PM"). Short enough for two chips per row.
const hourSpan = (h) => {
  const [a, b] = [fmtHour(h), fmtHour(h + 1)].map((t) => t.replace(':00', ''));
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} - ${b}` : `${a} - ${b}`;
};

// The hour grid and the add-booking form share one selection, so they can't drift apart:
// free hours toggle (grid or chips), booked hours link to their details (rendered by the server as `detail`).
export default function HourBoard({ children, slots, query, selected, detail, addAction, back, courtLabel, court, date }) {
  const [picked, setPicked] = useState(() => (selected !== null && !detail ? [selected] : []));
  const panel = useRef(null);
  // this device's push endpoint, so the "new booking" push skips the admin who made it
  const [push, setPush] = useState('');
  useEffect(() => {
    navigator.serviceWorker?.getRegistration('/admin')
      .then((reg) => reg?.pushManager?.getSubscription())
      .then((sub) => setPush(sub?.endpoint ?? '')).catch(() => {});
  }, []);

  const toggle = (h) => {
    const next = picked.includes(h) ? picked.filter((x) => x !== h) : [...picked, h].sort((a, b) => a - b);
    setPicked(next);
    // phones: the form sits below the grid, so bring it into view on the first pick
    if (!picked.length && next.length && panel.current?.getBoundingClientRect().top > innerHeight) {
      panel.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const past = new Set(slots.filter((s) => s.past).map((s) => s.h));
  // chips: every free upcoming hour, plus past hours the admin clicked on the left (record-keeping)
  const chips = slots.filter((s) => s.state === 'free' && (!s.past || picked.includes(s.h)));
  const recording = picked.some((h) => past.has(h));
  const showDetail = detail && !picked.length;

  return (
    <>
      <div className="schedule-main">
      {children /* court toggle, day strip, legend: server-rendered */}
      <nav className="slots admin-slots" aria-label="Hours">
        {slots.map(({ h, state, name, past: isPast }) => state === 'free' ? (
          <button key={h} type="button" className={`slot free${isPast ? ' past' : ''}`} aria-pressed={picked.includes(h)} onClick={() => toggle(h)}>
            <span className="slot-time">{fmtHour(h)}</span>
            <small className="clip">{isPast ? 'Past' : 'Free'}</small>
          </button>
        ) : (
          <Link key={h} href={`/admin?${query}&hour=${h}#detail`} className={`slot ${state}`}
            aria-current={showDetail && selected === h ? 'true' : undefined}>
            <span className="slot-time">{fmtHour(h)}</span>
            <small className="clip">{name}</small>
          </Link>
        ))}
      </nav>
      </div>

      <aside className="slot-detail" id="detail" ref={panel} aria-live="polite">
        {showDetail ? detail : (
          <form action={addAction} className="form" autoComplete="off">
            <p className="label">{picked.length ? `${recording ? 'Record' : 'Book'} ${courtLabel}` : 'Add a walk-in or phone booking'}</p>
            {recording && <p className="muted">Some of these hours have passed. Saving records them for your books.</p>}
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="court" value={court} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="push" value={push} />
            <label>Name<input name="name" required maxLength={100} autoComplete="off" placeholder="Customer name…" /></label>
            <label>Phone<input name="phone" type="tel" inputMode="tel" required maxLength={20} autoComplete="off" placeholder="98XXXXXXXX…" /></label>
            <fieldset className="hour-picks">
              <legend>Time <span className="muted">(pick one or more)</span></legend>
              {chips.length ? chips.map(({ h }) => (
                <label key={h} className="pick">
                  <input type="checkbox" name="hours" value={h} checked={picked.includes(h)} onChange={() => toggle(h)} />
                  {hourSpan(h)}
                </label>
              )) : <p className="muted">No free hours left on this day.</p>}
            </fieldset>
            <label>Email <span className="muted">(optional)</span><input name="email" type="email" autoComplete="off" spellCheck={false} /></label>
            <button className="btn big" disabled={!picked.length}>
              {picked.length ? `Add Booking (${picked.length} ${picked.length === 1 ? 'hour' : 'hours'})` : 'Pick an hour first'}
            </button>
          </form>
        )}
      </aside>
    </>
  );
}
