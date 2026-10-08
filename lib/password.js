import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Staff passwords, stored as "salt:hash" (hex). scrypt is built into Node and slow on purpose, which makes guessing expensive.
export const hashPassword = (pw) => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(String(pw), salt, 64).toString('hex')}`;
};

export const verifyPassword = (pw, stored) => {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, 'hex');
  return timingSafeEqual(scryptSync(String(pw), Buffer.from(salt, 'hex'), want.length), want);
};

// Checked against unknown usernames too, so a wrong username takes as long as a wrong password.
export const DUMMY_HASH = hashPassword('not-a-real-password');
