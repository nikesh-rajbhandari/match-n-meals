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
