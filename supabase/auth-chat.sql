-- ============================================================
-- Muhsingraphy — accounts & chat
-- ------------------------------------------------------------
-- Run AFTER supabase/schema.sql (it reuses public.is_admin()).
--
-- SECURITY MODEL — read before changing anything here.
--   * Clients hold only the publishable key. Every table below has
--     Row Level Security enabled. The secret key is never used.
--   * role lives in public.profile and is protected by a trigger.
--     RLS cannot restrict columns, so without that trigger a user
--     could simply UPDATE their own row to role = 'admin'. Do not
--     remove public.protect_profile_fields.
--   * OTP / email confirmation is DISABLED by request. Consequence:
--     nobody proves they own the email or phone they register with.
--     See "KNOWN LIMITATION" at the bottom.
-- ============================================================

create extension if not exists citext;

-- ── profile ─────────────────────────────────────────────────
-- One row per auth user, created automatically on signup.
create table if not exists public.profile (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        citext unique not null,
  phone        text unique,
  display_name text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default now()
);

-- ── chat ────────────────────────────────────────────────────
-- Exactly one conversation thread per user, with the studio.
create table if not exists public.thread (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique not null references public.profile(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists public.message (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.thread(id) on delete cascade,
  sender_id  uuid not null references public.profile(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists idx_message_thread on public.message (thread_id, created_at);
create index if not exists idx_thread_last    on public.thread (last_message_at desc);

-- ── signup: create profile + thread ─────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, email, phone, display_name, role)
  values (
    new.id,
    lower(new.email),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'display_name', '')), ''),
    'user'
  )
  on conflict (id) do nothing;

  insert into public.thread (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── role escalation guard ───────────────────────────────────
-- RLS cannot stop a user editing a single column of their own row.
-- This trigger can: role / email / phone are immutable from the
-- client. Server-side contexts (auth.uid() is null, e.g. the SQL
-- editor or an Edge Function) may still change them.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if new.role is distinct from old.role then
      raise exception 'role changes are not permitted';
    end if;
    if new.email is distinct from old.email then
      raise exception 'email cannot be changed';
    end if;
    if new.phone is distinct from old.phone then
      raise exception 'phone cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_protect on public.profile;
create trigger profile_protect
  before update on public.profile
  for each row execute function public.protect_profile_fields();

-- ── chat bookkeeping ────────────────────────────────────────
-- Bump the thread timestamp on every message. Security definer so it
-- does not depend on the sender holding UPDATE rights on thread.
create or replace function public.touch_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.thread set last_message_at = now() where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists message_touch on public.message;
create trigger message_touch
  after insert on public.message
  for each row execute function public.touch_thread();

-- ── RLS ─────────────────────────────────────────────────────
alter table public.profile enable row level security;
alter table public.thread  enable row level security;
alter table public.message enable row level security;

-- profile: read your own, or everything if admin. Update your own
-- (trigger guards the sensitive columns), or anything if admin.
drop policy if exists profile_read on public.profile;
create policy profile_read on public.profile
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profile_self_update on public.profile;
create policy profile_self_update on public.profile
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- thread: your own, or all if admin.
drop policy if exists thread_read on public.thread;
create policy thread_read on public.thread
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists thread_insert_self on public.thread;
create policy thread_insert_self on public.thread
  for insert with check (user_id = auth.uid());

-- message: visible if it is in your thread, or you are admin.
drop policy if exists message_read on public.message;
create policy message_read on public.message
  for select using (
    public.is_admin()
    or exists (select 1 from public.thread t where t.id = message.thread_id and t.user_id = auth.uid())
  );

-- You may post as yourself into your own thread; an admin may post
-- into any thread (that is how admin replies work).
drop policy if exists message_insert on public.message;
create policy message_insert on public.message
  for insert with check (
    sender_id = auth.uid()
    and (
      public.is_admin()
      or exists (select 1 from public.thread t where t.id = message.thread_id and t.user_id = auth.uid())
    )
  );

-- Delete/update intentionally omitted: a chat log stays immutable.

-- ============================================================
-- KNOWN LIMITATION — verification is disabled, per the request.
--
-- Email confirmation and phone OTP are switched off, so registering
-- proves ownership of nothing. Because email and phone are unique per
-- account, anyone can register a word that belongs to someone else
-- (e.g. a customer's address, or a colleague's phone number) and
-- permanently block the real owner from signing up with it. There is
-- also no password reset: that requires reading the mailbox.
--
-- Recommended before launch:
--   1. Re-enable email confirmation (Authentication -> Providers ->
--      Email -> Confirm email).
--   2. Treat phone as an unverified contact field, not an identifier.
--   3. If you truly need phone-only signup, re-enable phone OTP —
--      Supabase Auth cannot do OTP-free phone auth.
-- ============================================================

-- ============================================================
-- Promote an admin (after creating the user in
-- Authentication -> Users, ideally with confirmation first):
--
--   update public.profile set role = 'admin'
--   where email = 'you@example.com';
-- ============================================================
