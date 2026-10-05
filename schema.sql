-- Run once in the Neon SQL editor.
create table if not exists bookings (
  id         serial primary key,
  court      text not null check (court in ('pickleball', 'basketball')),
  date       date not null,
  hour       int  not null check (hour between 0 and 23),
  name       text not null,
  phone      text not null,
  email      text,
  status     text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  unique (court, date, hour) -- the DB itself prevents double-booking; pending requests hold the slot too
);

-- Migration for databases created before `status` existed (old bookings count as approved):
-- alter table bookings add column if not exists status text not null default 'approved' check (status in ('pending', 'approved'));
-- alter table bookings alter column status set default 'pending';

-- Admin phones/browsers that get a push notification for each new website booking (the admin PWA).
create table if not exists push_subscriptions (
  endpoint   text primary key,          -- unique per browser install; re-subscribing upserts
  keys       jsonb not null,            -- { p256dh, auth } from PushSubscription.toJSON()
  created_at timestamptz not null default now()
);
