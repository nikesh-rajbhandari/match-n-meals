// node --experimental-detect-module --test lib/money.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRs, parseDiscount, summarize, collectedBy } from './money.js';

test('parseRs', () => {
  assert.equal(parseRs('2,000'), 2000);
  assert.equal(parseRs('Rs 500'), 500);
  for (const bad of ['', '0', '-5', '12.5', 'abc', '99999999', null]) assert.equal(parseRs(bad), null);
});

test('parseDiscount', () => {
  assert.deepEqual(parseDiscount('200', 3000), { amount: 200 });
  assert.deepEqual(parseDiscount('Rs 1,000', 3000), { amount: 1000 });
  assert.deepEqual(parseDiscount('10', 3000, true), { amount: 300 });
  assert.deepEqual(parseDiscount('12.5%', 1500, true), { amount: 188 });
  assert.deepEqual(parseDiscount('', 3000), { amount: 0 });
  assert.ok(parseDiscount('10%', 3000).error); // % typed while NPR is picked: ask, don't guess
  assert.ok(parseDiscount('5000', 3000).error);
  assert.ok(parseDiscount('110', 3000, true).error);
  assert.ok(parseDiscount('ten', 3000).error);
  assert.ok(parseDiscount('-5', 3000, true).error);
});

test('summarize', () => {
  const pay = (amount) => ({ kind: 'payment', amount });
  assert.equal(summarize({ total: 3000 }, []).state, 'unpaid');
  assert.deepEqual(summarize({ total: 3000 }, [pay(700), { kind: 'discount', amount: 300 }]),
    { total: 3000, discount: 300, paid: 700, refunded: 0, held: 0, due: 2000, state: 'part' });
  assert.equal(summarize({ total: 3000 }, [pay(700), pay(2300)]).state, 'paid');
  assert.equal(summarize({ total: 1500 }, [pay(1500), { kind: 'discount', amount: 100 }]).state, 'over');
  // every hour cancelled: money paid is held until refunded
  assert.deepEqual(summarize({ total: 0 }, [pay(500)]), { total: 0, discount: 0, paid: 500, refunded: 0, held: 500, due: 0, state: 'held' });
  assert.equal(summarize({ total: 0 }, [pay(500), { kind: 'refund', amount: 500 }]).state, 'refunded');
  // no-show: the deposit is kept, nothing held or due
  assert.deepEqual(summarize({ total: 0, no_show: true }, [pay(500)]), { total: 0, discount: 0, paid: 500, refunded: 0, held: 0, due: 0, state: 'noshow' });
  // an unconfirmed (voided) payment is kept for the record but doesn't count
  assert.deepEqual(summarize({ total: 3000 }, [pay(700), { ...pay(2300), voided_at: '2026-10-07' }]),
    { total: 3000, discount: 0, paid: 700, refunded: 0, held: 0, due: 2300, state: 'part' });
});

test('collectedBy: refunds come off the payment they return', () => {
  const pay = (amount, method, created_by) => ({ kind: 'payment', amount, method, created_by });
  const refund = (amount, method, created_by) => ({ kind: 'refund', amount, method, created_by });
  // Ram took 3000 cash, Sita refunded it: nobody kept anything (Sita isn't -3000)
  assert.deepEqual(collectedBy([{ entries: [pay(3000, 'cash', 'Ram'), refund(3000, 'cash', 'Sita')] }]), {});
  // a 400 QR deposit kept, the 950 payment undone
  assert.deepEqual(collectedBy([{ entries: [pay(400, 'qr', null), { ...pay(950, 'qr', 'Ram'), voided_at: 'x' }] }]),
    { 'Not recorded': { cash: 0, qr: 400 } });
  // partial refund prefers the same method: 500 cash back comes off the cash payment, not the QR deposit
  assert.deepEqual(collectedBy([{ entries: [pay(500, 'qr', 'Ram'), pay(1000, 'cash', 'Sita'), refund(500, 'cash', 'Ram')] }]),
    { Ram: { cash: 0, qr: 500 }, Sita: { cash: 500, qr: 0 } });
});
