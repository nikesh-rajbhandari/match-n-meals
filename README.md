# Match & Meals

Court booking (pickleball / basketball, 6 AM - 9 PM) + admin panel. Next.js on Vercel, Postgres on Neon.

## Pages
- `/` - booking widget up top, then how it works, hours and contact (edit `app/page.js`)
- `/book` - the same booking widget on its own; customer requests start as **pending** and hold the slot
- `/admin` - password-protected: "Needs Approval" list (approve / reject website requests), then a schedule per court and day; click an hour to see who booked it, approve or cancel, or add a walk-in on a free hour (approved straight away)

Prices, opening hours and courts live in `lib/config.js`.

## Deposit + payment proof
Requests start **pending** (customers see the slot as "On hold") until the Rs 500 deposit is paid. After requesting, the customer gets a booking code (`MNM-<id>`), the payment QR and a WhatsApp link with the code, name and phone pre-filled (a scannable QR on desktop, a button on phones). Admin approves from `/admin` once the screenshot arrives; holds are never auto-released (we can't know if proof was sent), but requests older than 2 h are flagged.

Set these in `lib/config.js` when ready (until then the QR is a placeholder and WhatsApp buttons are hidden):
- `WHATSAPP` - venue number, digits with country code, e.g. `9779812345678`
- `PAY_QR` - merchant QR image saved in `public/`, e.g. `/pay-qr.png`
- `DEPOSIT` / `RATE` - amounts in rupees

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
