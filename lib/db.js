import { neon, neonConfig } from '@neondatabase/serverless';

// DB_ENV=local (in .env.local) -> the Docker database from compose.yaml; anything else -> DATABASE_URL (production).
// Never local on Vercel, even if the variable leaks into the project settings.
const local = process.env.DB_ENV === 'local' && !process.env.VERCEL;
if (local) neonConfig.fetchEndpoint = () => 'http://localhost:4444/sql'; // the neon-proxy service
const query = neon(local ? 'postgres://postgres:postgres@db.localtest.me:5432/main' : process.env.DATABASE_URL);

// Free-plan Neon suspends after ~5 min idle; the first request while it wakes can fail to connect.
// Retry connection failures once after a short pause. Every query goes through here, so all pages get it.
// ponytail: a retried insert whose first attempt actually landed reports "slot taken" (the unique
// constraint still prevents double-booking); add idempotency keys if that ever confuses customers.
export const sql = (strings, ...values) =>
  query(strings, ...values).catch(async (e) => {
    if (!/fetch failed|Error connecting/i.test(e.message)) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return query(strings, ...values);
  });
