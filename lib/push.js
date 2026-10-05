import webpush from 'web-push';
import { sql } from './db';

const ready = !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (ready) {
  webpush.setVapidDetails('https://match-n-meals.vercel.app', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

// Sends to every admin device that turned notifications on. Never throws: a failed push must not affect a booking.
export async function notifyAdmins(payload) {
  if (!ready) return;
  const subs = await sql`select endpoint, keys from push_subscriptions`.catch(() => []);
  await Promise.all(subs.map(({ endpoint, keys }) =>
    webpush.sendNotification({ endpoint, keys }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: 'high' })
      .catch((e) => {
        // 404/410: the browser dropped this subscription (app uninstalled, permission revoked)
        if (e.statusCode === 404 || e.statusCode === 410) return sql`delete from push_subscriptions where endpoint = ${endpoint}`;
        console.error('push failed', e.statusCode ?? e.message);
      })));
}
