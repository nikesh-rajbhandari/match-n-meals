'use server';
import { sql } from '@/lib/db';
import { isAdmin } from '@/lib/admin';
import { notifyAdmins } from '@/lib/push';

// sub = PushSubscription.toJSON(): { endpoint, keys: { p256dh, auth } }
export async function saveSubscription(sub) {
  if (!(await isAdmin())) return { ok: false };
  const endpoint = String(sub?.endpoint ?? '');
  const { p256dh, auth } = sub?.keys ?? {};
  if (!endpoint.startsWith('https://') || typeof p256dh !== 'string' || typeof auth !== 'string') return { ok: false };
  await sql`insert into push_subscriptions (endpoint, keys) values (${endpoint}, ${JSON.stringify({ p256dh, auth })})
            on conflict (endpoint) do update set keys = excluded.keys`;
  return { ok: true };
}

export async function removeSubscription(endpoint) {
  if (!(await isAdmin())) return { ok: false };
  await sql`delete from push_subscriptions where endpoint = ${String(endpoint)}`;
  return { ok: true };
}

export async function sendTest() {
  if (!(await isAdmin())) return { ok: false };
  await notifyAdmins({ title: 'Notifications are working', body: 'New booking requests will show up like this.', url: '/admin' });
  return { ok: true };
}
