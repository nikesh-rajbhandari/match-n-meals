'use client';
import { useEffect, useState } from 'react';
import { COURTS, DEPOSIT, RATE, PAY_QR, WHATSAPP, rs, fmtSpan, waLink } from '@/lib/config';
import { longDate } from '@/lib/dates';

// "Pay to confirm" step after a request. Proof of payment goes to the venue on WhatsApp, so the layout follows the device:
// phone: save the QR -> pay in the banking app -> one tap opens WhatsApp on the same phone.
// computer: scan the payment QR with the phone, then scan a second QR that opens WhatsApp *on the phone* (where the screenshot is).
// Which half shows is decided in CSS (.on-phone / .on-desk via pointer + hover media queries), not by sniffing the user agent.
export default function PayDeposit({ done }) {
  const when = `${longDate(done.date)}, ${fmtSpan(done.hours)}`;
  // same text for the phone button and the desktop QR; name + phone let the admin match it even if sent from another number
  const message = `Hi Match & Meals, here is my ${rs(DEPOSIT)} deposit for booking ${done.ref}: ${COURTS[done.court]}, ${when}.\nName: ${done.name}\nPhone: ${done.phone}`;
  const wa = WHATSAPP && waLink(WHATSAPP, message);
  const [waQr, setWaQr] = useState(null);

  useEffect(() => { // only load the QR library when there's a number to point at
    if (!wa) return;
    import('qrcode').then((q) => q.toDataURL(wa, { margin: 1, width: 360, errorCorrectionLevel: 'M' })).then(setWaQr).catch(() => {});
  }, [wa]);

  const payQr = PAY_QR ? (
    <img src={PAY_QR} alt={`Payment QR for the ${rs(DEPOSIT)} deposit`} width="200" height="200" className="qr" />
  ) : (
    <div className="qr qr-placeholder" role="img" aria-label="Payment QR coming soon">Payment QR<br />coming soon</div>
  );

  return (
    <div className="popup-body pay">
      <h2>Pay {rs(DEPOSIT)} to Confirm</h2>
      <p>Your time is on hold, {done.name}. Pay the deposit, then send us the screenshot.</p>
      <p className="ref">Booking code <strong translate="no">{done.ref}</strong></p>

      <ol className="pay-steps">
        <li>
          <strong>Pay {rs(DEPOSIT)}</strong>
          <span className="on-desk">Scan with your banking or wallet app.</span>
          <span className="on-phone">Save the QR, then in your banking app choose <em>Scan from gallery</em>.</span>
          {payQr}
          {PAY_QR && <a className="btn ghost on-phone" href={PAY_QR} download={`match-n-meals-pay-${done.ref}.png`}>Save QR to Photos</a>}
        </li>
        <li>
          <strong>Send the screenshot</strong>
          {wa ? <>
            <a className="btn on-phone" href={wa} target="_blank" rel="noopener">Send on WhatsApp</a>
            <span className="on-desk">Scan with your phone camera. WhatsApp opens with the message ready; attach the screenshot.</span>
            {waQr && <img className="qr on-desk" src={waQr} alt="QR code that opens WhatsApp on your phone" width="180" height="180" />}
            <span className="muted">Or WhatsApp it to +{WHATSAPP} with code {done.ref}.</span>
          </> : (
            <span className="muted">Keep your payment screenshot. We’ll call {done.phone} to confirm and collect it.</span>
          )}
        </li>
      </ol>

      <dl>
        <dt>Court</dt><dd>{COURTS[done.court]}</dd>
        <dt>When</dt><dd>{when}</dd>
        <dt>Deposit now</dt><dd>{rs(DEPOSIT)}</dd>
        <dt>At the counter</dt><dd>{rs(RATE * done.hours.length - DEPOSIT)}</dd>
      </dl>
      <p className="note">We confirm once the screenshot arrives.</p>
      <form method="dialog"><button className="btn big">Done</button></form>
    </div>
  );
}
