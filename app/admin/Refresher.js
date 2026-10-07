'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Keeps the admin current. An iOS Home Screen app resumes on whatever page it last showed and has no reload gesture,
// so re-fetch the server data every 30s while visible, whenever the app comes back to the front, and on pull-down.
// router.refresh() keeps client state (a half-filled add-booking form survives).
export default function Refresher() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [pulled, setPulled] = useState(false); // spinner only for a pull, not the quiet background refreshes
  const pill = useRef(null);
  const refresh = () => start(() => router.refresh());

  useEffect(() => { if (!busy) setPulled(false); }, [busy]);

  useEffect(() => {
    const tick = () => document.visibilityState === 'visible' && refresh();
    const timer = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    addEventListener('pageshow', tick); // restored from the back/forward cache
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      removeEventListener('pageshow', tick);
    };
  }, []);

  // pull-to-refresh only in the installed app; browsers have their own
  useEffect(() => {
    if (!matchMedia('(display-mode: standalone)').matches && !navigator.standalone) return;
    const READY = 80;
    let y0 = null, d = 0;
    const down = (e) => { y0 = scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; d = 0; };
    const move = (e) => {
      if (y0 === null) return;
      d = Math.max(0, e.touches[0].clientY - y0);
      // move the pill straight from the touch, outside React renders
      pill.current.classList.add('pulling');
      pill.current.style.transform = `translateY(${Math.min(d, 120) * 0.6 - 64}px)`;
      pill.current.dataset.ready = d > READY;
    };
    const up = () => {
      if (y0 !== null && d > READY) { setPulled(true); refresh(); }
      y0 = null; d = 0;
      pill.current.classList.remove('pulling');
      pill.current.style.transform = '';
      pill.current.dataset.ready = false;
    };
    const opts = { passive: true };
    addEventListener('touchstart', down, opts);
    addEventListener('touchmove', move, opts);
    addEventListener('touchend', up, opts);
    addEventListener('touchcancel', up, opts);
    return () => {
      removeEventListener('touchstart', down, opts);
      removeEventListener('touchmove', move, opts);
      removeEventListener('touchend', up, opts);
      removeEventListener('touchcancel', up, opts);
    };
  }, []);

  return (
    <div ref={pill} className={`ptr${pulled ? ' busy' : ''}`} aria-hidden="true"><span>↓</span></div>
  );
}
