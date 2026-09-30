-- Opp 9: read-only history links for a coach or partner. The id is the unguessable token in the URL (/h/$token).
-- Revoking deletes the row, so a revoked link stops resolving at once. Nothing here is public by default:
-- a link exists only after its owner creates one.
create table if not exists lockd_history_links (
  id text primary key,
  user_id text not null,
  label text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists lockd_history_links_user_idx on lockd_history_links (user_id, created_at desc);
