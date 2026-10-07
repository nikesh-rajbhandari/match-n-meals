'use client';
import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { hours, fmtHour } from '@/lib/config';

// Change Date / Time popup for one booked hour: offers only hours on that court that are free and haven't started yet,
// read from the same availability API the booking page uses. The server re-checks (see `move` in page.js).
export default function MoveForm({ action, back, id, court, date, hour, t, now }) {
  const [day, setDay] = useState(date);
  const [busy, setBusy] = useState(null); // booked/held hours on `day`; null while loading, 'err' if it failed
  const [tries, setTries] = useState(0); // Retry bumps it to fetch again
  useEffect(() => {
    if (!day) return;
    let live = true;
    setBusy(null);
    fetch(`/api/bookings?${new URLSearchParams({ court, date: day })}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setBusy([...d.taken, ...d.held]), () => live && setBusy('err'));
    return () => { live = false; };
  }, [court, day, tries]);

  const open = Array.isArray(busy) && day >= t ? hours().filter((h) => !busy.includes(h) && !(day === t && h < now)) : [];
  const note = !day ? 'Pick a date.' : day < t ? 'That day has passed.' : busy === null ? 'Checking free hours…'
    : busy === 'err' ? 'Couldn’t load free hours. Check the connection and retry.' : !open.length ? 'No free hours left on this day.' : null;

  return (
    <form action={action} className="form" autoComplete="off">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="id" value={id} />
      <label>Date<input type="date" name="date" required min={t} value={day} onChange={(e) => setDay(e.target.value)} /></label>
      <label>Time
        {/* keyed so the list resets per day; keeps the current hour when it's free on the new day */}
        <select key={`${day}-${busy}`} name="hour" required disabled={!open.length} defaultValue={open.includes(hour) ? hour : undefined}>
          {open.map((h) => <option key={h} value={h}>{fmtHour(h)} - {fmtHour(h + 1)}</option>)}
        </select>
      </label>
      {/* always mounted: a live region only announces changes to an element that was already there */}
      <p className="muted" aria-live="polite">
        {note}
        {busy === 'err' && <button type="button" className="btn ghost small" onClick={() => setTries((n) => n + 1)}>Retry</button>}
      </p>
      <Submit ready={open.length > 0} />
    </form>
  );
}

// disabled while the move is saving, so a double tap can't send it twice
function Submit({ ready }) {
  const { pending } = useFormStatus();
  return <button className="btn big" disabled={!ready || pending}>{pending ? 'Moving…' : 'Move Booking'}</button>;
}
