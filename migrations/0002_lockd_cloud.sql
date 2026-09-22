-- Lock’d cloud: per-user gym vault, public locker, shareable receipts, Lab notes.
create table if not exists lockd_vaults (
  user_id text primary key,
  payload jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists lockd_profiles (
  user_id text primary key,
  handle text not null unique,
  display_name text not null,
  bio text not null default '',
  lens text,
  is_public boolean not null default true,
  card jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lockd_profiles_handle_idx on lockd_profiles (handle);

create table if not exists lockd_shares (
  id text primary key,
  user_id text not null,
  kind text not null,
  title text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists lockd_shares_user_idx on lockd_shares (user_id, created_at desc);

create table if not exists lockd_lab_notes (
  id text primary key,
  user_id text not null,
  question text not null default '',
  answer text not null,
  created_at timestamptz not null default now()
);
create index if not exists lockd_lab_notes_user_idx on lockd_lab_notes (user_id, created_at desc);
