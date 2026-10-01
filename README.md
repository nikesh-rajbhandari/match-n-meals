# Match & Meals

Info site + court booking (pickleball / basketball) + admin panel. Next.js on Vercel, Postgres on Neon.

## Pages
- `/` — info: courts, menu, hours, contact (edit `app/page.js`)
- `/book` — pick court, date, 1-hour slot; taken slots are greyed out
- `/admin` — password-protected booking list, filter by date, cancel bookings

Prices, opening hours and courts live in `lib/config.js`.

## Setup
1. Create a free project at https://neon.tech, open the **SQL Editor**, run `schema.sql`.
2. Create `.env.local`:
   ```
   DATABASE_URL=postgresql://...   # Neon "pooled" connection string
   ADMIN_PASSWORD=pick-something-long
   ```
3. `npm install && npm run dev` → http://localhost:3000

## Deploy (free)
1. Push this repo to GitHub.
2. https://vercel.com/new → import the repo.
3. Add env vars `DATABASE_URL` and `ADMIN_PASSWORD` → Deploy.
