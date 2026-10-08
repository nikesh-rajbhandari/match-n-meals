'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { isAdmin, startSession, backTo, staffFields, ENV_OWNER } from '@/lib/admin';

// Staff tab actions, owners only. Disabling someone or changing their password logs out all their devices.
const done = (form, msg, err) => { revalidatePath('/admin'); redirect(backTo(form, msg, err)); };
const owner = async () => { const me = await isAdmin(); return me?.role === 'owner' ? me : null; };

export async function addStaff(form) {
  if (!(await owner())) return;
  const f = staffFields(form), role = form.get('role') === 'owner' ? 'owner' : 'staff';
  if (f.error) return done(form, f.error, true);
  if (f.username === ENV_OWNER) return done(form, `The username ${ENV_OWNER} is reserved. Pick another.`, true);
  try {
    await sql`insert into admins (username, name, password, role) values (${f.username}, ${f.name}, ${f.password}, ${role})`;
  } catch (e) {
    if (e.code !== '23505') throw e;
    return done(form, `The username ${f.username} is taken. Pick another.`, true);
  }
  done(form, `Added ${f.name}. They log in as ${f.username}.`);
}

// Edit: name, username, and optionally a new password (also how a forgotten password is reset). A new password logs that account out everywhere (except
// this device, if owners change their own).
export async function editStaff(form) {
  const me = await owner();
  if (!me) return;
  const id = Number(form.get('id')), f = staffFields(form, true), pw = !!f.password;
  if (f.error) return done(form, f.error, true);
  // the permanent owner can't be edited (its password is ADMIN_PASSWORD); nobody else can become "admin"
  const [t] = await sql`select env_owner from admins where id = ${id}`;
  if (t?.env_owner) return done(form, 'The permanent owner can’t be edited. Change ADMIN_USERNAME / ADMIN_PASSWORD in the environment settings.', true);
  if (f.username === ENV_OWNER) return done(form, `The username ${ENV_OWNER} is reserved. Pick another.`, true);
  let a;
  try {
    [a] = await sql`with gone as (delete from admin_sessions where admin_id = ${id} and ${pw}::boolean)
      update admins set username = ${f.username}, name = ${f.name}, password = coalesce(${f.password}, password),
        failed_logins = case when ${pw}::boolean then 0 else failed_logins end,
        locked_until = case when ${pw}::boolean then null else locked_until end
      where id = ${id} returning name`;
  } catch (e) {
    if (e.code !== '23505') throw e;
    return done(form, `The username ${f.username} is taken. Pick another.`, true);
  }
  if (a && pw && id === me.id) await startSession(me.id);
  done(form, a && (!pw ? `Saved ${a.name}`
    : id === me.id ? 'Saved. Your other devices are logged out and need the new password.'
    : `Saved ${a.name}. They’re logged out and need the new password.`));
}

// set = enable | disable | owner | staff. Owners can't change themselves, so there's always an owner who can get in.
export async function changeStaff(form) {
  const me = await owner();
  if (!me) return;
  const id = Number(form.get('id')), set = String(form.get('set'));
  if (id === me.id) return done(form, 'You can’t disable or demote yourself. Ask another owner.', true);
  const [t] = await sql`select env_owner from admins where id = ${id}`;
  if (t?.env_owner) return done(form, 'The permanent owner can’t be disabled or made staff.', true);
  const active = set === 'enable' ? true : set === 'disable' ? false : null;
  const role = ['owner', 'staff'].includes(set) ? set : null;
  if (active === null && !role) return;
  const [a] = await sql`with gone as (delete from admin_sessions where admin_id = ${id} and ${active === false}::boolean)
    update admins set active = coalesce(${active}::boolean, active), role = coalesce(${role}, role),
      failed_logins = case when ${active === true}::boolean then 0 else failed_logins end,
      locked_until = case when ${active === true}::boolean then null else locked_until end
    where id = ${id} returning name`;
  done(form, a && { enable: `${a.name} can log in again`, disable: `Disabled ${a.name}. They’re logged out everywhere.`,
    owner: `${a.name} is now an owner`, staff: `${a.name} is now staff` }[set]);
}
