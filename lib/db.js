import { neon } from '@neondatabase/serverless';

const query = neon(process.env.DATABASE_URL);

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
