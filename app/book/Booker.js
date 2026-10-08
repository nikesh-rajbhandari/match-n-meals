'use client';
import { useEffect, useRef, useState } from 'react';
import { COURTS, PRICE, MAX_HOURS, hours, fmtHour, fmtSpan } from '@/lib/config';
import { today, hourNow, isDate, addDays, dayLabel, longDate, weekOf } from '@/lib/dates';
import Icon from '@/app/Icon';
import PayDeposit from './PayDeposit';

export default function Booker() {
  const [court, setCourt] = useState('pickleball');
  const [t, setT] = useState(null); // venue "today"; set after mount so the static HTML never bakes in the build date
  const [date, setDate] = useState(null);
  const [pick, setPick] = useState([]); // sorted consecutive hours, at most MAX_HOURS
  const [taken, setTaken] = useState(null); // null (loading) | 'error' | { taken: [hours], held: [hours] }
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null); // last successful request, shown in the popup
  const [busy, setBusy] = useState(false);

  const req = useRef(0);
  const dialog = useRef(null);
  useEffect(() => { if (done) dialog.current.showModal(); }, [done]);

  // restore court/date from the URL (?court=basketball&date=2026-10-12) so a selection can be shared
  useEffect(() => {
    const q = new URLSearchParams(location.search), now = today();
    if (COURTS[q.get('court')]) setCourt(q.get('court'));
    setT(now);
    setDate(isDate(q.get('date')) && q.get('date') >= now ? q.get('date') : now);
  }, []);

  // quiet = background refresh: keep the current grid on screen, and keep it if the refresh fails
  const load = (quiet) => {
    const id = ++req.current; // ignore responses for a court/date the user already left
    if (!quiet) setTaken(null);
    fetch(`/api/bookings?court=${court}&date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => id === req.current && setTaken({ taken: d.taken ?? [], held: d.held ?? [], closed: d.closed ?? [] }))
      .catch(() => id === req.current && setTaken((t) => (quiet && t ? t : 'error'))); // never show slots as free when we couldn't check
  };
  useEffect(() => {
    if (!date) return;
    setPick([]); setError(null); load();
    const q = new URLSearchParams(location.search);
    q.set('court', court); q.set('date', date);
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
    // pick up other people's requests: every 30s while the tab is visible, and right when it comes back
    const tick = () => document.visibilityState === 'visible' && load(true);
    const timer = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [court, date]);

  const isFree = (h) => taken?.taken && ![taken.taken, taken.held, taken.closed].some((l) => l.includes(h));
  // someone else grabbed a picked hour since the last refresh
  useEffect(() => {
    if (taken?.taken && pick.some((h) => !isFree(h))) {
      setPick([]);
      setError('Someone just booked that time. Pick another.');
    }
  }, [taken]);

  // tap = pick that hour; tapping a free hour right next to a single pick extends it (max MAX_HOURS, never split)
  const toggle = (h) => {
    setError(null);
    setPick((p) => p.includes(h) ? p.filter((x) => x !== h)
      : p.length && p.length < MAX_HOURS && (h === p[0] - 1 || h === p.at(-1) + 1) ? [...p, h].sort((a, b) => a - b)
      : [h]);
  };

  // the strip shows the 7-day block (counted from today) that holds the selected date
  const { offset, start, days: week } = t && date ? weekOf(t, date) : { offset: 0, start: null, days: [] };
  const nowHour = date === t ? hourNow() : -1;
  const open = hours().filter((h) => h > nowHour); // hide today's past slots

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(e.target));
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, court, date, hours: pick }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone({ court, date, hours: pick, name: form.name, phone: form.phone, ref: data.ref });
        e.target.reset();
        setPick([]);
      } else {
        setError(data.error || 'Couldn’t send your request. Try again in a moment.');
      }
    } catch {
      setError('Couldn’t reach us. Check your connection and try again.');
    }
    setBusy(false);
    load();
  }

  return (
    <div className="booker">
      <div className="seg" role="group" aria-label="Court">
        {Object.entries(COURTS).map(([k, label]) => (
          <button key={k} type="button" data-court={k} aria-pressed={court === k} onClick={() => setCourt(k)}>
            <Icon name={k} />
            {label}
          </button>
        ))}
      </div>

      <div className="week-head">
        <p className="label" id="day-label">Day</p>
        {t && (
          <div className="week-nav">
            <span className="range">{dayLabel(start, { month: 'short', day: 'numeric' })} - {dayLabel(week[6], { month: 'short', day: 'numeric' })}</span>
            {offset > 0 && <button type="button" className="today" onClick={() => setDate(t)}>Today</button>}
            <button type="button" aria-label="Previous week" disabled={offset === 0}
              onClick={() => setDate(offset === 7 ? t : addDays(start, -7))}><span aria-hidden="true">←</span></button>
            <button type="button" aria-label="Next week" onClick={() => setDate(addDays(start, 7))}><span aria-hidden="true">→</span></button>
          </div>
        )}
      </div>
      <div className="days" role="group" aria-labelledby="day-label">
        {t ? week.map((d, i) => (
          <button key={d} type="button" aria-pressed={date === d} aria-label={longDate(d)} onClick={() => setDate(d)}>
            <small>{d === t ? 'Today' : dayLabel(d, { weekday: 'short' })}</small>
            <strong>{dayLabel(d, { day: 'numeric' })}</strong>
          </button>
        )) : Array.from({ length: 7 }, (_, i) => <span key={i} className="skeleton day" />)}
      </div>
      <label className="other-day">Jump to date
        <input type="date" name="date" value={date ?? ''} min={t ?? undefined} onChange={(e) => e.target.value >= t && setDate(e.target.value)} />
      </label>

      <p className="label">Time <span className="muted">· {PRICE[court]}, up to {MAX_HOURS}&nbsp;hours in a row</span></p>
      <div aria-live="polite">
        {taken === null ? (
          <div className="slots" aria-busy="true" aria-label="Loading times…">
            {open.map((h) => <span key={h} className="skeleton" />)}
          </div>
        ) : taken === 'error' ? (
          <p className="empty" role="alert">Couldn’t load the times. Check your connection and{' '}
            <button type="button" className="link-btn" onClick={load}>try again</button>.</p>
        ) : open.length === 0 ? (
          <p className="empty">We’re closed for today. Pick another day above.</p>
        ) : (
          <div className="slots" role="group" aria-label="Start time">
            {open.map((h) => {
              // held = someone requested it and owes the deposit; it may free up again
              const label = taken.closed.includes(h) ? 'Closed' : taken.taken.includes(h) ? 'Taken' : taken.held.includes(h) ? 'On hold'
                : pick.length === 1 && Math.abs(h - pick[0]) === 1 ? '+1 hour' : null;
              return (
                <button key={h} type="button" disabled={!isFree(h)} aria-pressed={pick.includes(h)} onClick={() => toggle(h)}>
                  {fmtHour(h)}
                  {label && <small>{label}</small>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="err" role="alert">{error}</p>}

      {pick.length > 0 && (
        <form onSubmit={submit} className="form">
          <label>Name<input name="name" required maxLength={100} autoComplete="name" placeholder="Your full name…" /></label>
          <label>Phone<input name="phone" type="tel" inputMode="tel" required pattern="[+\d\s\-]{7,20}" autoComplete="tel" placeholder="98XXXXXXXX…" /></label>
          <button className="btn big" disabled={busy}>
            {busy ? 'Sending…' : `Request ${fmtSpan(pick)}`}
          </button>
        </form>
      )}

      <dialog ref={dialog} className="popup" onClose={() => setDone(null)}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
        {done && <PayDeposit done={done} />}
      </dialog>
    </div>
  );
}
