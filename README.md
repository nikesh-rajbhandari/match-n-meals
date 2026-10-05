# Match & Meals

Court booking (pickleball / basketball, 6 AM - 9 PM) + admin panel. Next.js on Vercel, Postgres on Neon.

## Pages
- `/` - booking widget up top, then courts, how it works, hours and contact (edit `app/page.js`)
- `/book` - the same booking widget on its own; customer requests start as **pending** and hold the slot
- `/admin` - password-protected: approve / reject pending requests, cancel bookings, filter by day, add walk-in or phone bookings (one or more hours, approved straight away)

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
