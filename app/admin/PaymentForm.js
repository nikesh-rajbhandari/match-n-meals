'use client';
import { useState } from 'react';
import { rs } from '@/lib/config';
import { parseDiscount } from '@/lib/money';

// Record Payment popup body, read like a bill: total, discount (NPR / %), what's already paid, total payable.
// Staff confirm once the customer has paid; the server re-works the payable amount and refuses if it differs from `expect`.
export default function PaymentForm({ action, back, bookingRef, total, paid, discount, pct }) {
  const [d, setD] = useState(discount);
  const [isPct, setPct] = useState(pct);
  const { amount: off = 0, error } = parseDiscount(d, total, isPct);
  const payable = total - off - paid;
  const id = `pay-f-${bookingRef}`;
  return (
    <form action={action} autoComplete="off">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="ref" value={bookingRef} />
      <input type="hidden" name="expect" value={payable} />

      <div className="bill">
        <dl><dt>Total</dt><dd>{rs(total)}</dd></dl>
        <label htmlFor={`${id}-d`}>Discount <span className="muted">(optional)</span></label>
        <div className="disc-row">
          <input id={`${id}-d`} name="discount" inputMode="decimal" placeholder={isPct ? 'e.g. 10…' : 'e.g. 200…'} value={d}
            onChange={(e) => setD(e.target.value)} aria-invalid={!!error} aria-describedby={`${id}-sum`} />
          <div className="seg" role="radiogroup" aria-label="Discount in">
            <label><input type="radio" name="unit" value="npr" checked={!isPct} onChange={() => setPct(false)} />NPR</label>
            <label><input type="radio" name="unit" value="pct" checked={isPct} onChange={() => setPct(true)} />%</label>
          </div>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <dl id={`${id}-sum`} aria-live="polite">
          {off > 0 && <><dt>Discount</dt><dd>−{rs(off)}</dd></>}
          {paid !== 0 && <><dt>Paid already</dt><dd>−{rs(paid)}</dd></>}
          <dt className="payable">Total payable</dt><dd className="payable">{error ? '–' : rs(Math.max(0, payable))}</dd>
        </dl>
        {!error && payable < 0 && <p className="err">That’s {rs(-payable)} more than what’s left to pay.</p>}
      </div>

      <p className="label" id={`${id}-m`}>Paid By</p>
      <div className="seg" role="radiogroup" aria-labelledby={`${id}-m`}>
        <label><input type="radio" name="method" value="cash" defaultChecked />Cash</label>
        <label><input type="radio" name="method" value="qr" />QR</label>
      </div>
      <label htmlFor={`${id}-n`}>Note <span className="muted">(optional)</span></label>
      <input id={`${id}-n`} name="note" maxLength={200} placeholder="e.g. regular customer…" />

      <button className="btn big" disabled={!!error || payable <= 0}>Confirm Payment</button>
    </form>
  );
}
