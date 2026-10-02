import { sql } from '@/lib/db';
import { COURTS, OPEN_HOUR, CLOSE_HOUR, TZ } from '@/lib/config';

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

// GET /api/bookings?court=pickleball&date=2026-10-01 -> { taken: [7, 9] }
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const court = searchParams.get('court');
  const date = searchParams.get('date');
  if (!COURTS[court] || !isDate(date)) return Response.json({ error: 'Invalid court or date' }, { status: 400 });

  const rows = await sql`select hour from bookings where court = ${court} and date = ${date}`;
  return Response.json({ taken: rows.map((r) => r.hour) });
}

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim();
  const phone = String(b.phone ?? '').trim();
  const email = String(b.email ?? '').trim() || null;
  const hour = Number(b.hour);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

  if (!COURTS[b.court]) return bad('Pick a court');
  if (!isDate(b.date) || b.date < today) return bad('Pick a valid date');
  if (!Number.isInteger(hour) || hour < OPEN_HOUR || hour >= CLOSE_HOUR) return bad('Pick a valid time');
  if (!name || name.length > 100) return bad('Enter your name');
  if (!/^[+\d\s-]{7,20}$/.test(phone)) return bad('Enter a valid phone number');
  if (email && (email.length > 200 || !email.includes('@'))) return bad('Enter a valid email');

  try {
    await sql`insert into bookings (court, date, hour, name, phone, email)
              values (${b.court}, ${b.date}, ${hour}, ${name}, ${phone}, ${email})`;
  } catch (e) {
    if (e.code === '23505') return bad('Sorry, that slot was just taken', 409);
    throw e;
  }
  return Response.json({ ok: true }, { status: 201 });
}

const bad = (error, status = 400) => Response.json({ error }, { status });
