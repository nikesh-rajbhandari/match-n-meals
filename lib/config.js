export const COURTS = { pickleball: 'Pickleball', basketball: 'Basketball' };
export const rs = (n) => `Rs ${new Intl.NumberFormat('en-IN').format(n)}`;
export const RATE = 1500;   // per court-hour
export const DEPOSIT = 500; // paid by QR to confirm a request; the rest is paid at the counter
export const PRICE = { pickleball: `${rs(RATE)} / hr`, basketball: `${rs(RATE)} / hr` };

// Payment proof goes over WhatsApp. Both are placeholders until the venue has them:
export const WHATSAPP = ''; // TODO: venue WhatsApp, digits with country code, e.g. '9779812345678'
export const PAY_QR = '';   // TODO: merchant QR (Fonepay/eSewa/Khalti) saved in public/, e.g. '/pay-qr.png'

export const bookingRef = (id) => `MNM-${id}`;
export const waLink = (number, text) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
// customer phone -> wa.me number: Nepali mobiles (98XXXXXXXX / 97XXXXXXXX) get the 977 country code
export const waNumber = (phone) => {
  const d = String(phone).replace(/\D/g, '');
  return /^9[78]\d{8}$/.test(d) ? `977${d}` : d;
};
export const TZ = 'Asia/Kathmandu'; // business timezone; servers (Vercel) run in UTC
export const OPEN_HOUR = 6;
export const CLOSE_HOUR = 21; // last slot starts at 20:00
export const MAX_HOURS = 2;   // longest online request: back-to-back hours only

export const hours = () =>
  Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);

const hourFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
export const fmtHour = (h) => hourFmt.format(Date.UTC(2000, 0, 1, h)); // "6:00 AM", non-breaking space included
export const fmtSpan = (hs) => `${fmtHour(hs[0])} - ${fmtHour(hs[hs.length - 1] + 1)}`; // sorted consecutive hours
