-- ============================================================
-- Muhsingraphy — live chat + admin reconciliation
-- ------------------------------------------------------------
-- OPTIONAL. Run AFTER supabase/schema.sql and supabase/auth-chat.sql.
--
-- The site does not need this to work: without it the chat still
-- updates on a 5–6 second timer. This file turns on instant delivery
-- and settles a mismatch between the two admin mechanisms.
--
-- Run in the SQL editor (Dashboard -> SQL -> New query).
-- ============================================================

-- ── 1. Publish the chat tables for Realtime ─────────────────
-- Realtime only streams changes for tables in this publication.
-- Without it the socket connects but every subscription is
-- refused with "Unable to subscribe to changes".
do $$
begin
  alter publication supabase_realtime add table public.message;
exception
  when duplicate_object then null;  -- already published
  when undefined_object then
    create publication supabase_realtime for table public.message;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.thread;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Fully-qualify nothing here; these tables carry the primary key
-- Realtime needs to identify rows, so no REPLICA IDENTITY change is
-- required. Deletes are not used by the chat, so this is sufficient.

-- ── 2. One admin concept, not two ───────────────────────────
--
-- As shipped, the two SQL files disagree about what an admin is:
--
--   * schema.sql     — membership of public.admin_user, via is_admin(),
--                      which every RLS policy uses.
--   * auth-chat.sql  — profile.role = 'admin', which admin-chat.js
--                      checks before showing the inbox.
--
-- So a user promoted through profile.role passed the page check but
-- was then denied every row by RLS, and saw an empty inbox. The check
-- below makes is_admin() accept either source, so the page and the
-- database agree. Safe to do because profile.role is guarded by
-- public.protect_profile_fields: a client cannot promote itself, only
-- the SQL editor can.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
           select 1 from public.admin_user a where a.user_id = auth.uid()
         )
      or exists (
           select 1 from public.profile p
           where p.id = auth.uid() and p.role = 'admin'
         );
$$;

-- ── 3. Confirm ──────────────────────────────────────────────
-- Expect one row per table below.
--
--   select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' and schemaname = 'public';
--
-- Promote an admin (either mechanism now works):
--
--   update public.profile set role = 'admin'
--   where email = 'you@example.com';
-- ============================================================
