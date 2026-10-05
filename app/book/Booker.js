'use client';
import { useEffect, useRef, useState } from 'react';
import { COURTS, PRICE, TZ, hours, fmtHour } from '@/lib/config';
import Icon from '@/app/Icon';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD at the venue
const hourNow = () => Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }));
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const dayLabel = (d, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(`${d}T00:00Z`));
const longDate = (d) => dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' });
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '');

export default function Booker() {
  const [court, setCourt] = useState('pickleball');
  const [t, setT] = useState(null); // venue "today"; set after mount so the static HTML never bakes in the build date
  const [date, setDate] = useState(null);
  const [hour, setHour] = useState(null);
  const [taken, setTaken] = useState(null);
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

  const load = () => {
    const id = ++req.current; // ignore responses for a court/date the user already left
    setTaken(null);
    fetch(`/api/bookings?court=${court}&date=${date}`)
      .then((r) => r.json())
      .then((d) => id === req.current && setTaken(d.taken ?? []))
      .catch(() => id === req.current && setTaken([]));
  };
  useEffect(() => {
    if (!date) return;
    setHour(null); setError(null); load();
    const q = new URLSearchParams(location.search);
    q.set('court', court); q.set('date', date);
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  }, [court, date]);

  const week = t ? Array.from({ length: 7 }, (_, i) => addDays(t, i)) : [];
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
        body: JSON.stringify({ ...form, court, date, hour }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone({ court, date, hour, name: form.name, phone: form.phone });
        e.target.reset();
        setHour(null);
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
          <button key={k} type="button" aria-pressed={court === k} onClick={() => setCourt(k)}>
            <Icon name={k} />
            {label}
          </button>
        ))}
      </div>

      <p className="label" id="day-label">Day</p>
      <div className="days" role="group" aria-labelledby="day-label">
        {t ? week.map((d, i) => (
          <button key={d} type="button" aria-pressed={date === d} aria-label={longDate(d)} onClick={() => setDate(d)}>
            <small>{i === 0 ? 'Today' : dayLabel(d, { weekday: 'short' })}</small>
            <strong>{dayLabel(d, { day: 'numeric' })}</strong>
          </button>
        )) : Array.from({ length: 7 }, (_, i) => <span key={i} className="skeleton day" />)}
      </div>
      <label className="other-day">Another date
        <input type="date" name="date" value={date ?? ''} min={t ?? undefined} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </label>

      <p className="label">Time <span className="muted">· 1&nbsp;hour, {PRICE[court]}</span></p>
      <div aria-live="polite">
        {taken === null ? (
          <div className="slots" aria-busy="true" aria-label="Loading times…">
            {open.map((h) => <span key={h} className="skeleton" />)}
          </div>
        ) : open.length === 0 ? (
          <p className="empty">We’re closed for today. Pick another day above.</p>
        ) : (
          <div className="slots" role="group" aria-label="Start time">
            {open.map((h) => {
              const booked = taken.includes(h);
              return (
                <button key={h} type="button" disabled={booked} aria-pressed={hour === h} onClick={() => setHour(h)}>
                  {fmtHour(h)}
                  {booked && <small>Taken</small>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="err" role="alert">{error}</p>}

      {hour !== null && (
        <form onSubmit={submit} className="form">
          <label>Name<input name="name" required maxLength={100} autoComplete="name" placeholder="Your full name…" /></label>
          <label>Phone<input name="phone" type="tel" inputMode="tel" required pattern="[+\d\s\-]{7,20}" autoComplete="tel" placeholder="98XXXXXXXX…" /></label>
          <label>Email <span className="muted">(optional)</span>
            <input name="email" type="email" autoComplete="email" spellCheck={false} placeholder="you@example.com…" />
          </label>
          <button className="btn big" disabled={busy}>
            {busy ? 'Sending…' : `Request ${fmtHour(hour)}`}
          </button>
        </form>
      )}

      <dialog ref={dialog} className="popup" onClose={() => setDone(null)}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
        {done && (
          <div className="popup-body">
            <img src={`/icons/${done.court}.webp`} alt="" width="88" height="88" />
            <h2>Request Sent</h2>
            <p>Thanks, {done.name}. You’ll get a call on {done.phone} to confirm your slot.</p>
            <dl>
              <dt>Court</dt><dd>{COURTS[done.court]}</dd>
              <dt>Date</dt><dd>{longDate(done.date)}</dd>
              <dt>Time</dt><dd>{fmtHour(done.hour)} - {fmtHour(done.hour + 1)}</dd>
              <dt>Price</dt><dd>{PRICE[done.court]}</dd>
            </dl>
            <p className="note">Pay at the counter when you arrive.</p>
            <form method="dialog"><button className="btn big" autoFocus>Done</button></form>
          </div>
        )}
      </dialog>
    </div>
  );
}
