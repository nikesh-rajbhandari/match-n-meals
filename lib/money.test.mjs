// node --experimental-detect-module --test lib/money.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRs, parseDiscount, summarize } from './money.js';

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
});
