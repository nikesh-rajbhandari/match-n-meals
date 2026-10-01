-- Run once in the Neon SQL editor.
create table if not exists bookings (
  id         serial primary key,
  court      text not null check (court in ('pickleball', 'basketball')),
  date       date not null,
  hour       int  not null check (hour between 0 and 23),
  name       text not null,
  phone      text not null,
  email      text,
  created_at timestamptz not null default now(),
  unique (court, date, hour) -- the DB itself prevents double-booking
);
