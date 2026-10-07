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
  email      text,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'cancelled')),
  created_at timestamptz not null default now()
);
-- the DB itself prevents double-booking; pending requests hold the slot too. Cancelled rows (kept because money
-- was paid) don't, so the slot can be booked again.
create unique index if not exists bookings_slot on bookings (court, date, hour) where status <> 'cancelled';

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
  created_at timestamptz not null default now()
);
create index if not exists payments_ref on payments (ref);

-- Admin phones/browsers that get a push notification for each new website booking (the admin PWA).
create table if not exists push_subscriptions (
  endpoint   text primary key,          -- unique per browser install; re-subscribing upserts
  keys       jsonb not null,            -- { p256dh, auth } from PushSubscription.toJSON()
  created_at timestamptz not null default now()
);
