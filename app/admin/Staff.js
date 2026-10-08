import { sql } from '@/lib/db';
import { stampFmt } from '@/lib/dates';
import ConfirmButton from './ConfirmButton';
import Popup from './Popup';
import PasswordInput from './PasswordInput';
import SubmitButton from './SubmitButton';
import { addStaff, editStaff, changeStaff } from './staff-actions';

// Owners only (page.js checks): who can log in to the admin, and add / edit / disable them. List and Add Staff side by side.
export default async function Staff({ me }) {
  const staff = await sql`select id, username, name, role, env_owner, active, created_at, coalesce(locked_until > now(), false) as locked
    from admins order by active desc, role, lower(name)`;
  const Back = () => <input type="hidden" name="back" value="/admin?tab=staff" />;
  const Change = ({ a, set, label, confirm, danger }) => (
    <form action={changeStaff}>
      <Back /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="set" value={set} />
      {confirm ? <ConfirmButton className={`btn small ghost${danger ? ' danger' : ''}`} message={confirm}>{label}</ConfirmButton>
        : <button className="btn small ghost">{label}</button>}
    </form>
  );

  // Add Staff and Edit share these; p = id prefix (one Edit popup per row), a = the account being edited
  const Fields = ({ p, a }) => (
    <>
      <label htmlFor={`${p}-name`}>Name</label>
      <input id={`${p}-name`} name="name" required maxLength={60} defaultValue={a?.name} autoComplete="off" />
      <label htmlFor={`${p}-username`}>Username</label>
      <input id={`${p}-username`} name="username" required pattern="[a-zA-Z0-9._\-]{3,32}" defaultValue={a?.username} autoComplete="off"
        autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-describedby={`${p}-username-hint`} />
      <small id={`${p}-username-hint`} className="muted hint">3-32 letters, numbers, dots, dashes or underscores. Used to log in.</small>
      <label htmlFor={`${p}-password`}>{a ? <>New password <span className="muted">(optional)</span></> : 'Password'}</label>
      <PasswordInput id={`${p}-password`} name="password" required={!a} minLength={8} autoComplete="new-password"
        aria-describedby={a ? `${p}-password-hint` : undefined} />
      {a && <small id={`${p}-password-hint`} className="muted hint">
        Leave blank to keep the current one. A new password logs {a.id === me.id ? 'your other devices' : 'them'} out.
      </small>}
    </>
  );

  return (
    <div className="staff-grid">
      <section aria-labelledby="staff-h">
        <h2 id="staff-h" className="admin-h">Staff</h2>
        <ul className="requests">
          {staff.map((a) => (
            <li key={a.id} className="request staff-row">
              <div className="request-who">
                <strong className="clip">{a.name}{a.id === me.id && <span className="muted"> (you)</span>}{a.env_owner && <span className="muted"> · permanent</span>}</strong>
                <span className="muted clip" translate="no">@{a.username}</span>
                <small className="age">Added {stampFmt.format(new Date(a.created_at))}</small>
              </div>
              <div className="staff-badges">
                <span className={`status ${a.active ? 'approved' : 'disabled'}`}>{a.role === 'owner' ? 'Owner' : 'Staff'}</span>
                {!a.active && <span className="status disabled">Disabled</span>}
                {a.locked && <span className="status pending">Locked 15&nbsp;min</span>}
              </div>
              <div className="actions">
                {a.env_owner ? <small className="muted">Permanent owner, set by ADMIN_USERNAME and ADMIN_PASSWORD in the environment settings.</small> : (
                  <Popup className="btn small ghost" label="Edit" title="Edit Staff">
                    <form action={editStaff} className="form" autoComplete="off">
                      <Back /><input type="hidden" name="id" value={a.id} />
                      <Fields p={`e${a.id}`} a={a} />
                      <SubmitButton className="btn" pendingLabel="Saving…">Save Changes</SubmitButton>
                    </form>
                  </Popup>
                )}
                {a.id !== me.id && !a.env_owner && a.active && (a.role === 'owner'
                  ? <Change a={a} set="staff" label="Make Staff" />
                  : <Change a={a} set="owner" label="Make Owner" confirm={`Make ${a.name} an owner? Owners can add, edit and disable staff.`} />)}
                {a.id !== me.id && !a.env_owner && (a.active
                  ? <Change a={a} set="disable" label="Disable" danger confirm={`Disable ${a.name}? They’re logged out and can’t log in until you enable them.`} />
                  : <Change a={a} set="enable" label="Enable" />)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="add-h">
        <h2 id="add-h" className="admin-h">Add Staff</h2>
        <form action={addStaff} className="panel form" autoComplete="off">
          <Back />
          <Fields p="s" />
          <label htmlFor="s-role">Role</label>
          <select id="s-role" name="role" defaultValue="staff">
            <option value="staff">Staff: bookings and payments</option>
            <option value="owner">Owner: also manages staff</option>
          </select>
          <SubmitButton className="btn" pendingLabel="Adding…">Add Staff</SubmitButton>
        </form>
      </section>
    </div>
  );
}
