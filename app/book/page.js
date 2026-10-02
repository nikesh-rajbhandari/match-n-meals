'use client';
import { useEffect, useRef, useState } from 'react';
import { COURTS, PRICE, TZ, hours, fmtHour } from '@/lib/config';
import Loading from '@/app/loading';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD at the venue
const hourNow = () => Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }));

export default function Book() {
  const [court, setCourt] = useState('pickleball');
  const [date, setDate] = useState(today);
  const [hour, setHour] = useState(null);
  const [taken, setTaken] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null); // last successful booking, shown in the popup
  const [busy, setBusy] = useState(false);

  const req = useRef(0);
  const dialog = useRef(null);
  useEffect(() => { if (done) dialog.current.showModal(); }, [done]);

  // preselect court from /book?court=basketball (links on the home page)
  useEffect(() => {
    const c = new URLSearchParams(location.search).get('court');
    if (COURTS[c]) setCourt(c);
  }, []);

  const load = () => {
    const id = ++req.current; // ignore responses for a court/date the user already left
    setTaken(null);
    fetch(`/api/bookings?court=${court}&date=${date}`)
      .then((r) => r.json())
      .then((d) => id === req.current && setTaken(d.taken ?? []))
      .catch(() => id === req.current && setTaken([]));
  };
  useEffect(() => { setHour(null); setError(null); load(); }, [court, date]);

  const nowHour = date === today() ? hourNow() : -1;
  const open = hours().filter((h) => h > nowHour); // hide today's past slots

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(e.target));
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, court, date, hour }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setDone({ court, date, hour, name: form.name });
      e.target.reset();
      setHour(null);
    } else {
      setError(data.error || 'Something went wrong');
    }
    load();
  }

  return (
    <section className="section narrow">
      <h1>Book a court</h1>

      <div className="tabs">
        {Object.entries(COURTS).map(([k, label]) => (
          <button key={k} className={court === k ? 'active' : ''} onClick={() => setCourt(k)}>
            {label} <small>{PRICE[k]}</small>
          </button>
        ))}
      </div>

      <label>Date
        <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} required />
      </label>

      <p className="label">Time (1 hour)</p>
      {taken === null ? <Loading /> : open.length === 0 ? (
        <p>No more slots today — pick another date.</p>
      ) : (
        <div className="slots">
          {open.map((h) => {
            const booked = taken.includes(h);
            return (
              <button key={h} type="button" disabled={booked}
                className={hour === h ? 'active' : ''} onClick={() => setHour(h)}>
                {fmtHour(h)}
                {booked && <small>Booked</small>}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="err" role="alert">{error}</p>}

      {hour !== null && (
        <form onSubmit={submit} className="form">
          <label>Name<input name="name" required maxLength={100} /></label>
          <label>Phone<input name="phone" type="tel" required pattern="[+\d\s\-]{7,20}" /></label>
          <label>Email (optional)<input name="email" type="email" /></label>
          <button className="btn big" disabled={busy}>
            {busy ? 'Booking…' : `Book ${fmtHour(hour)}`}
          </button>
        </form>
      )}

      <dialog ref={dialog} className="popup" onClose={() => setDone(null)}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
        {done && (
          <div className="popup-body">
            <img src={`/icons/${done.court}.webp`} alt="" width="96" height="96" />
            <h2>You're booked!</h2>
            <p>See you on court, {done.name}.</p>
            <dl>
              <dt>Court</dt><dd>{COURTS[done.court]}</dd>
              <dt>Date</dt><dd>{new Date(`${done.date}T00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</dd>
              <dt>Time</dt><dd>{fmtHour(done.hour)} – {fmtHour(done.hour + 1)}</dd>
              <dt>Price</dt><dd>{PRICE[done.court]}</dd>
            </dl>
            <p className="note">Pay at the counter when you arrive.</p>
            <form method="dialog"><button className="btn big" autoFocus>Done</button></form>
          </div>
        )}
      </dialog>
    </section>
  );
}
