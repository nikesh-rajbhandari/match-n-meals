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
   ADMIN_USERNAME=admin                 # username of the permanent owner account (optional, default admin)
   ADMIN_PASSWORD=pick-something-long   # its password
   ```
3. `npm install && npm run dev` → http://localhost:3000
4. Open `/admin` and log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`. That's the permanent owner: it always uses those two
   values and can't be edited, disabled or demoted in the app. Add the other staff on the **Staff** tab.
   Each change on Bookings and Payments records who made it.

### Forgotten passwords
- **Staff:** an owner opens the **Staff** tab, taps **Edit** on that person, types a **New password** and tells them in person.
  That also unlocks the account and logs it out on other devices.
- **Owners:** log in as the permanent owner (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) and reset it the same way.
- **The permanent owner:** change `ADMIN_PASSWORD` and/or `ADMIN_USERNAME` (`.env.local`, or Vercel project settings then
  redeploy). The next login with the new values renames the same account (history kept) and signs out every session from
  before, so changing them also locks out anyone who knew the old ones.

## Deploy (free)
1. Push this repo to GitHub.
2. https://vercel.com/new → import the repo.
3. Add env vars `DATABASE_URL`, `ADMIN_USERNAME` (optional) and `ADMIN_PASSWORD` → Deploy. Keep `ADMIN_PASSWORD` long and
   private: it's the owner key.
