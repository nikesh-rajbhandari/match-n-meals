'use client';

// Shown instead of a crash when /admin can't load, e.g. the database is briefly unreachable.
export default function AdminError({ reset }) {
  return (
    <section className="section login">
      <div className="panel">
        <h1>Couldn’t Load Bookings</h1>
        <p className="muted">The database didn’t respond. This is usually a brief network drop, so try again in a moment.</p>
        <button className="btn big" onClick={reset}>Try Again</button>
      </div>
    </section>
  );
}
