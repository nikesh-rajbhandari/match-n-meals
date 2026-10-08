'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fmtHour } from '@/lib/config';
import SubmitButton from './SubmitButton';

// 13 -> "1 - 2 PM"; AM/PM shown once unless the block crosses noon ("11 AM - 12 PM"). Short enough for two chips per row.
const hourSpan = (h) => {
  const [a, b] = [fmtHour(h), fmtHour(h + 1)].map((t) => t.replace(':00', ''));
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} - ${b}` : `${a} - ${b}`;
};

// The hour grid and the add-booking form share one selection, so they can't drift apart:
// free hours toggle (grid or chips), booked hours link to their details (rendered by the server as `detail`).
export default function HourBoard({ children, slots, query, selected, detail, addAction, back, courtLabel, court, date, canBlock }) {
  const [picked, setPicked] = useState(() => (selected !== null && !detail ? [selected] : []));
  const [mode, setMode] = useState('book'); // book = walk-in / phone booking; block = maintenance, events (not bookable)
  const block = mode === 'block';
  const [weeks, setWeeks] = useState('1'); // repeat weekly: 1 = this day only, up to 4 (regulars, recurring maintenance)
  const n = Number(weeks);
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
        {slots.map(({ h, state, name, code, alt, past: isPast }) => state === 'free' ? (
          <button key={h} type="button" className={`slot free${isPast ? ' past' : ''}`} aria-pressed={picked.includes(h)} onClick={() => toggle(h)}>
            <span className="slot-time">{fmtHour(h)}</span>
            <small className="clip">{isPast ? 'Past' : 'Free'}</small>
          </button>
        ) : (
          <Link key={h} href={`/admin?${query}&hour=${h}#detail`} className={`slot ${state}${alt ? ' alt' : ''}`}
            aria-current={showDetail && selected === h ? 'true' : undefined}>
            <span className="slot-time">{fmtHour(h)}</span>
            <small className="clip">{name}</small>
            <small className="slot-code" translate="no">{code}</small>
          </Link>
        ))}
      </nav>
      </div>

      <aside className="slot-detail" id="detail" ref={panel} aria-live="polite">
        {showDetail ? detail : (
          <form action={addAction} className="form" autoComplete="off">
            {canBlock && ( // owners only
              <div className="seg" role="radiogroup" aria-label="Add">
                <label><input type="radio" name="mode" value="book" checked={!block} onChange={() => setMode('book')} />Booking</label>
                <label><input type="radio" name="mode" value="block" checked={block} onChange={() => setMode('block')} />Block</label>
              </div>
            )}
            <p className="label">{block ? `Block ${courtLabel}` : picked.length ? `${recording ? 'Record' : 'Book'} ${courtLabel}` : 'Add a walk-in or phone booking'}</p>
            {block && <p className="muted">For maintenance or events. Customers see these hours as Closed.</p>}
            {!block && recording && <p className="muted">Some of these hours have passed. Saving records them for your books.</p>}
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="court" value={court} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="push" value={push} />
            {block ? (
              <label>Reason<input key="reason" name="name" required maxLength={100} autoComplete="off" placeholder="e.g. Maintenance…" /></label>
            ) : <>
              <label>Name<input key="name" name="name" required maxLength={100} autoComplete="off" placeholder="Customer name…" /></label>
              <label>Phone<input name="phone" type="tel" inputMode="tel" required maxLength={20} autoComplete="off" placeholder="98XXXXXXXX…" /></label>
            </>}
            <fieldset className="hour-picks">
              <legend>Time <span className="muted">(pick one or more)</span></legend>
              {chips.length ? chips.map(({ h }) => (
                <label key={h} className="pick">
                  <input type="checkbox" name="hours" value={h} checked={picked.includes(h)} onChange={() => toggle(h)} />
                  {hourSpan(h)}
                </label>
              )) : <p className="muted">No free hours left on this day.</p>}
            </fieldset>
            <label htmlFor="weeks">Repeat</label>
            <select id="weeks" name="weeks" value={weeks} onChange={(e) => setWeeks(e.target.value)} aria-describedby="weeks-hint">
              <option value="1">Don’t repeat (this day only)</option>
              {[2, 3, 4].map((w) => <option key={w} value={w}>Every week, {w} weeks in total</option>)}
            </select>
            <small id="weeks-hint" className="muted hint">Same court and hours each week. Weeks already taken are skipped.</small>
            <SubmitButton className="btn big" disabled={!picked.length} pendingLabel="Saving…">
              {!picked.length ? 'Pick an hour first'
                : `${block ? 'Block' : 'Add Booking'} (${picked.length} ${picked.length === 1 ? 'hour' : 'hours'}${n > 1 ? ` × ${n} weeks` : ''})`}
            </SubmitButton>
          </form>
        )}
      </aside>
    </>
  );
}
