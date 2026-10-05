// Route-level Suspense fallback (e.g. /admin while bookings load).
export default function Loading() {
  return (
    <section className="section" role="status" aria-label="Loading">
      <span className="skeleton" style={{ width: 220, height: 40 }} />
      <span className="skeleton" style={{ height: 320, marginTop: 24 }} />
    </section>
  );
}
