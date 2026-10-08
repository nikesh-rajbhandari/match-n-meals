-- Run once in the Neon SQL editor.
create table if not exists bookings (
  id         serial primary key,
  court      text not null check (court in ('pickleball', 'basketball')),
  date       date not null,
  hour       int  not null check (hour between 0 and 23),
  ref        int,                 -- booking group: min id of the hours booked together (MNM-<ref>); payments hang off it
  rate       int  not null default 1500, -- Rs per hour at booking time, so a price change never rewrites past books
  name       text not null,
  phone      text not null,
  email      text,                -- no longer asked for (nothing ever emailed); kept for old rows
  -- rejected = a request turned down; cancelled = an approved booking called off; no_show = an approved booking that ended
  -- without the customer (any deposit is kept, nothing more is owed). All are kept, and none holds the slot.
  -- blocked = closed by the venue (maintenance, events; name = the reason); unblocked = a block that was lifted.
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'cancelled', 'rejected', 'no_show', 'blocked', 'unblocked')),
  created_at timestamptz not null default now(),
  -- who did what: the staff member's name at the time (text, so it outlives their account)
  created_by  text,                -- null = the customer, from the website
  approved_by text,
  approved_at timestamptz,
  changed_by  text,                -- last move / cancel / reject / no-show (or undoing one)
  changed_at  timestamptz
);
-- the DB itself prevents double-booking; pending requests and blocks hold the slot too. Cancelled, rejected, no-show
-- and unblocked rows don't, so the slot can be booked again.
create unique index if not exists bookings_slot on bookings (court, date, hour) where status in ('pending', 'approved', 'blocked');

-- Migration for databases created before `status` existed (old bookings count as approved):
-- alter table bookings add column if not exists status text not null default 'approved' check (status in ('pending', 'approved'));
-- alter table bookings alter column status set default 'pending';

-- Migration for the Payments tab (run in order):
-- alter table bookings add column if not exists ref int;
-- alter table bookings add column if not exists rate int not null default 1500;
-- update bookings b set ref = g.r from (select id, min(id) over (partition by court, date, phone, created_at) r from bookings) g
--   where b.id = g.id and b.ref is null; -- hours booked together were one insert, so they share created_at
-- alter table bookings drop constraint bookings_status_check;
-- alter table bookings add constraint bookings_status_check check (status in ('pending', 'approved', 'cancelled'));
-- create unique index if not exists bookings_slot on bookings (court, date, hour) where status <> 'cancelled';
-- alter table bookings drop constraint bookings_court_date_hour_key;
-- then run the payments table below.

-- Money ledger, one row per event: payment (deposit or balance), discount (at most one per booking), refund. Whole rupees.
-- Keyed by booking ref, not a foreign key: rows outlive cancelled bookings on purpose.
create table if not exists payments (
  id         serial primary key,
  ref        int  not null,
  kind       text not null check (kind in ('payment', 'discount', 'refund')),
  amount     int  not null check (amount > 0),
  method     text check (method in ('cash', 'qr')), -- null for discounts
  note       text,
  created_at timestamptz not null default now(),
  created_by text,                 -- staff name
  -- undone (Unconfirm Payment, or a discount replaced): the row stays for the record but no longer counts
  voided_by  text,
  voided_at  timestamptz
);
create index if not exists payments_ref on payments (ref);

-- Admin phones/browsers that get a push notification for each new website booking (the admin PWA).
create table if not exists push_subscriptions (
  endpoint   text primary key,          -- unique per browser install; re-subscribing upserts
  keys       jsonb not null,            -- { p256dh, auth } from PushSubscription.toJSON()
  created_at timestamptz not null default now()
);

-- Staff accounts: each logs in with their own username + password (lib/admin.js). The first login, "admin" with
-- ADMIN_PASSWORD from .env, creates the owner account `admin`; owners add the rest on the Staff tab.
create table if not exists admins (
  id            serial primary key,
  username      text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  name          text not null,
  email         text,                          -- no longer asked for; kept for old rows
  password      text not null,                 -- scrypt "salt:hash", see lib/password.js
  role          text not null default 'staff' check (role in ('owner', 'staff')),
  active        boolean not null default true,
  env_owner     boolean not null default false, -- the permanent owner: ADMIN_USERNAME / ADMIN_PASSWORD from .env (one row)
  failed_logins int not null default 0,        -- 5 wrong passwords lock the account for 15 minutes
  locked_until  timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists admins_env_owner on admins (env_owner) where env_owner;
create table if not exists admin_sessions (
  token_hash text primary key,                 -- sha256 of the cookie, so a leaked table can't be replayed
  admin_id   int not null references admins on delete cascade,
  expires_at timestamptz not null
);

-- Activity log: one line per change, never edited or deleted. Shown as History on the booking and on its Payments row.
create table if not exists activity (
  id         serial primary key,
  at         timestamptz not null default now(),
  who        text,                         -- staff name; null = the customer, from the website
  ref        int,                          -- the booking code it belongs to (MNM-<ref>)
  text       text not null,                -- "Approved · Rs 500 deposit (QR)"
  correction boolean not null default false -- an undo (unconfirm, undo refund, undo no-show, discount replaced)
);
create index if not exists activity_ref on activity (ref);

-- Migration for staff accounts (databases created before them): run the two create tables above, then
-- alter table bookings add column if not exists created_by text;
-- alter table bookings add column if not exists approved_by text;
-- alter table bookings add column if not exists approved_at timestamptz;
-- alter table bookings add column if not exists changed_by text;
-- alter table bookings add column if not exists changed_at timestamptz;
-- alter table payments add column if not exists created_by text;

-- Migration for keeping rejected requests (they used to be deleted):
-- alter table bookings drop constraint bookings_status_check;
-- alter table bookings add constraint bookings_status_check check (status in ('pending', 'approved', 'cancelled', 'rejected'));
-- drop index bookings_slot;
-- create unique index bookings_slot on bookings (court, date, hour) where status in ('pending', 'approved');

-- Migration for no-shows:
-- alter table bookings drop constraint bookings_status_check;
-- alter table bookings add constraint bookings_status_check check (status in ('pending', 'approved', 'cancelled', 'rejected', 'no_show'));

-- Migration for the activity log: run the create table + index above.

-- Migration for the permanent owner (ADMIN_USERNAME / ADMIN_PASSWORD):
-- alter table admins add column if not exists env_owner boolean not null default false;
-- update admins set env_owner = true where username = 'admin';
-- create unique index if not exists admins_env_owner on admins (env_owner) where env_owner;

-- Migration for blocked hours:
-- alter table bookings drop constraint bookings_status_check;
-- alter table bookings add constraint bookings_status_check
--   check (status in ('pending', 'approved', 'cancelled', 'rejected', 'no_show', 'blocked', 'unblocked'));
-- drop index bookings_slot;
-- create unique index bookings_slot on bookings (court, date, hour) where status in ('pending', 'approved', 'blocked');

-- Migration for keeping undone payments (they used to be deleted):
-- alter table payments add column if not exists voided_by text;
-- alter table payments add column if not exists voided_at timestamptz;
