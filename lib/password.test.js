// node --test lib/password.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password.js';

test('passwords round-trip and wrong ones fail', () => {
  const h = hashPassword('correct horse');
  assert.ok(verifyPassword('correct horse', h));
  assert.ok(!verifyPassword('correct hors', h));
  assert.ok(!verifyPassword('correct horse', 'garbage'));
  assert.notEqual(hashPassword('correct horse'), h); // salted
});
