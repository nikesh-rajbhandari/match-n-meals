import { after } from 'next/server';
import { sql } from '@/lib/db';
import { notifyAdmins } from '@/lib/push';
import { COURTS, OPEN_HOUR, CLOSE_HOUR, TZ, fmtHour, bookingRef } from '@/lib/config';
import { dayLabel } from '@/lib/dates';

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

// GET /api/bookings?court=pickleball&date=2026-10-01 -> { taken: [7], held: [9] }
// taken = approved; held = requested, waiting for the deposit (still not bookable)
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const court = searchParams.get('court');
  const date = searchParams.get('date');
  if (!COURTS[court] || !isDate(date)) return Response.json({ error: 'Invalid court or date' }, { status: 400 });

  const rows = await sql`select hour, status from bookings where court = ${court} and date = ${date}`;
  const hoursWhere = (st) => rows.filter((r) => r.status === st).map((r) => r.hour);
  return Response.json({ taken: hoursWhere('approved'), held: hoursWhere('pending') });
}

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim();
  const phone = String(b.phone ?? '').trim();
  const email = String(b.email ?? '').trim() || null;
  const hour = Number(b.hour);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

  if (!COURTS[b.court]) return bad('Pick a court');
  if (!isDate(b.date) || b.date < today) return bad('Pick today or a later date');
  if (!Number.isInteger(hour) || hour < OPEN_HOUR || hour >= CLOSE_HOUR) return bad('Pick one of the open time slots');
  if (!name || name.length > 100) return bad('Enter your name');
  if (!/^[+\d\s-]{7,20}$/.test(phone)) return bad('Enter a phone number using digits, spaces, + or -');
  if (email && (email.length > 200 || !email.includes('@'))) return bad('Enter a valid email, or leave it blank');

  let id;
  try {
    [{ id }] = await sql`insert into bookings (court, date, hour, name, phone, email)
                         values (${b.court}, ${b.date}, ${hour}, ${name}, ${phone}, ${email}) returning id`;
  } catch (e) {
    if (e.code === '23505') return bad('That slot was just taken. Pick another time.', 409);
    throw e;
  }
  // ping the admin app after the customer already has their answer
  after(() => notifyAdmins({
    title: `New request ${bookingRef(id)}: ${COURTS[b.court]}, ${fmtHour(hour)}`,
    body: `${name} · ${dayLabel(b.date, { weekday: 'short', month: 'short', day: 'numeric' })} · approve once the deposit screenshot arrives`,
    url: `/admin?${new URLSearchParams({ court: b.court, date: b.date, hour })}#detail`,
  }));
  return Response.json({ ok: true, ref: bookingRef(id) }, { status: 201 });
}

const bad = (error, status = 400) => Response.json({ error }, { status });
