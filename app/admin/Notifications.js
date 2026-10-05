'use client';
import { useEffect, useState } from 'react';
import { saveSubscription, removeSubscription, sendTest } from './push-actions';

const key = () => {
  const b64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// state: loading | ios-install | unsupported | blocked | off | on
export default function Notifications() {
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  useEffect(() => { // "Test sent" etc. clear themselves
    if (!note) return;
    const id = setTimeout(() => setNote(null), 6000);
    return () => clearTimeout(id);
  }, [note]);

  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      setState(ios && !standalone ? 'ios-install' : 'unsupported'); // iOS only exposes push to Home Screen apps
      return;
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/admin', updateViaCache: 'none' })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(Notification.permission === 'denied' ? 'blocked' : sub ? 'on' : 'off'))
      .catch(() => setState('unsupported'));
  }, []);

  const run = (fn) => async () => {
    setBusy(true); setNote(null);
    try { await fn(); } catch { setNote('Something went wrong. Try again.'); }
    setBusy(false);
  };

  const turnOn = run(async () => {
    if ((await Notification.requestPermission()) !== 'granted') return setState('blocked');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() });
    const res = await saveSubscription(sub.toJSON());
    if (!res.ok) { await sub.unsubscribe(); throw new Error('save failed'); }
    setState('on');
  });

  const turnOff = run(async () => {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await removeSubscription(sub.endpoint); await sub.unsubscribe(); }
    setState('off');
  });

  const test = run(async () => { await sendTest(); setNote('Test sent. It should arrive in a few seconds.'); });

  if (state === 'loading') return null;
  return (
    <div className="notify" role="region" aria-label="Booking notifications">
      {state === 'on' && <>
        <p><strong>Notifications are on</strong> for this device. You’ll get one for every new website request.</p>
        <div className="actions">
          <button className="btn ghost" onClick={test} disabled={busy}>Send Test</button>
          <button className="btn ghost" onClick={turnOff} disabled={busy}>Turn Off</button>
        </div>
      </>}
      {state === 'off' && <>
        <p><strong>Get notified of new bookings.</strong> Turn this on for each phone or computer that should ring.</p>
        <button className="btn" onClick={turnOn} disabled={busy}>{busy ? 'Turning On…' : 'Turn On Notifications'}</button>
      </>}
      {state === 'blocked' && <p><strong>Notifications are blocked.</strong> Allow them for this site in your browser or phone settings, then reload.</p>}
      {state === 'ios-install' && <p><strong>Install the app to get notifications.</strong> In Safari, tap Share, then Add to Home Screen, and open Match &amp; Meals Admin from there.</p>}
      {state === 'unsupported' && <p className="muted">This browser can’t show push notifications. Use Chrome on Android, or Safari after adding the app to your Home Screen.</p>}
      {note && <p className="muted" role="status">{note}</p>}
    </div>
  );
}
