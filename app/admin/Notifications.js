'use client';
import { useEffect, useState } from 'react';
import Icon from '@/app/Icon';
import { saveSubscription, removeSubscription, sendTest } from './push-actions';

const key = () => {
  const b64 = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// Why the bell can't turn on, shown when it's tapped in those states.
const HELP = {
  blocked: 'Notifications are blocked. Allow them for this site in your browser or phone settings, then reload.',
  'ios-install': 'Install the app to get notifications: in Safari, tap Share, then Add to Home Screen, and open Match & Meals Admin from there.',
  unsupported: 'This browser can’t show push notifications. Use Chrome on Android, or Safari after adding the app to your Home Screen.',
};

// Header bell: one tap turns booking notifications on or off for this device; when on, a send icon fires a test.
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
    // fallback from sw.js when it can't navigate this window itself (window not yet controlled by it)
    const onMessage = (e) => { if (e.data?.type === 'open' && e.data.url?.startsWith(location.origin + '/admin')) location.assign(e.data.url); };
    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.register('/sw.js', { scope: '/admin', updateViaCache: 'none' })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(Notification.permission === 'denied' ? 'blocked' : sub ? 'on' : 'off'))
      .catch(() => setState('unsupported'));
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  const run = (fn) => async () => {
    setBusy(true); setNote(null);
    try { await fn(); } catch { setNote('Something went wrong. Try again.'); }
    setBusy(false);
  };

  const turnOn = run(async () => {
    if ((await Notification.requestPermission()) !== 'granted') { setState('blocked'); return setNote(HELP.blocked); }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() });
    const res = await saveSubscription(sub.toJSON());
    if (!res.ok) { await sub.unsubscribe(); throw new Error('save failed'); }
    setState('on'); setNote('Notifications on. This device will ring for every new booking request.');
  });

  const turnOff = run(async () => {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await removeSubscription(sub.endpoint); await sub.unsubscribe(); }
    setState('off'); setNote('Notifications off for this device.');
  });

  const test = run(async () => { await sendTest(); setNote('Test sent. It should arrive in a few seconds.'); });

  if (state === 'loading') return null;
  const on = state === 'on', canToggle = on || state === 'off';
  return (
    <>
      {on && (
        <button type="button" className="icon-btn" onClick={test} disabled={busy} aria-label="Send a test notification" title="Send a test notification">
          <Icon name="send" />
        </button>
      )}
      <button type="button" className={`icon-btn bell${on ? ' on' : ''}${canToggle ? '' : ' warn'}`} disabled={busy}
        onClick={canToggle ? (on ? turnOff : turnOn) : () => setNote(HELP[state])}
        aria-pressed={canToggle ? on : undefined}
        aria-label={on ? 'Booking notifications are on for this device' : canToggle ? 'Turn on booking notifications' : 'Booking notifications unavailable'}
        title={on ? 'Notifications on (tap to turn off)' : canToggle ? 'Turn on notifications' : 'Notifications unavailable'}>
        <Icon name={on ? 'bell' : 'bell-off'} />
      </button>
      {note && (
        <div className="notice" role="status">
          <p>{note}</p>
          <button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setNote(null)}><span aria-hidden="true">×</span></button>
        </div>
      )}
    </>
  );
}
