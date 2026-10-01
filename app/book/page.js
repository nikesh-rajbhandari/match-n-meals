'use client';
import { useEffect, useState } from 'react';
import { COURTS, PRICE, hours, fmtHour } from '@/lib/config';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local

export default function Book() {
  const [court, setCourt] = useState('pickleball');
  const [date, setDate] = useState(today);
  const [hour, setHour] = useState(null);
  const [taken, setTaken] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setTaken(null);
    fetch(`/api/bookings?court=${court}&date=${date}`)
      .then((r) => r.json())
      .then((d) => setTaken(d.taken ?? []))
      .catch(() => setTaken([]));
  };
  useEffect(() => { setHour(null); load(); }, [court, date]);

  const nowHour = date === today() ? new Date().getHours() : -1;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const form = Object.fromEntries(new FormData(e.target));
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, court, date, hour }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `Booked! ${COURTS[court]} on ${date} at ${fmtHour(hour)}. Pay at the counter.` });
      e.target.reset();
      setHour(null);
    } else {
      setMsg({ ok: false, text: data.error || 'Something went wrong' });
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
      {taken === null ? <p>Loading availability…</p> : (
        <div className="slots">
          {hours().map((h) => {
            const off = taken.includes(h) || h <= nowHour;
            return (
              <button key={h} type="button" disabled={off}
                className={hour === h ? 'active' : ''} onClick={() => setHour(h)}>
                {fmtHour(h)}
              </button>
            );
          })}
        </div>
      )}

      {msg && <p className={msg.ok ? 'ok' : 'err'} role="status">{msg.text}</p>}

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
    </section>
  );
}
