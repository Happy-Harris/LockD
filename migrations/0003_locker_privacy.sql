-- A profile is private until its owner explicitly publishes it.
-- This migration runs once through the existing migration ledger; later opt-ins survive.
alter table lockd_profiles alter column is_public set default false;
alter table lockd_profiles add column privacy_notice_pending boolean not null default false;
update lockd_profiles
set is_public = false, privacy_notice_pending = true, updated_at = now()
where is_public = true;
