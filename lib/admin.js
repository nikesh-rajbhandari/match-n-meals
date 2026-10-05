import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';

// The admin cookie holds a hash of the password, so changing ADMIN_PASSWORD logs everyone out.
export const adminToken = () => createHash('sha256').update(`mnm:${process.env.ADMIN_PASSWORD}`).digest('hex');

export async function isAdmin() {
  const c = (await cookies()).get('admin')?.value;
  return !!process.env.ADMIN_PASSWORD && !!c && c.length === 64 &&
    timingSafeEqual(Buffer.from(c), Buffer.from(adminToken()));
}
