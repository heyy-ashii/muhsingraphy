-- ============================================================
-- Muhsingraphy — Supabase schema (Option A: static site + RLS)
-- ------------------------------------------------------------
-- Run in the Supabase SQL editor (Dashboard -> SQL -> New query).
--
-- SECURITY MODEL
--   * Only the PUBLISHABLE key ever reaches the browser. That key is
--     public by design, so every table below has Row Level Security ON
--     with explicit policies. Never disable RLS on these tables.
--   * The SECRET key (sb_secret_...) is NOT used by this project and
--     must never be embedded in a static site. It bypasses RLS.
--   * Admin writes/reads require an authenticated user whose id is
--     listed in public.admin_user. Grant that after creating the admin
--     account (see the note at the bottom).
-- ============================================================

-- ── extension ───────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── helpers ─────────────────────────────────────────────────
-- List of auth users allowed to act as studio admin.
create table if not exists public.admin_user (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Security-definer check so policies can call it without recursion.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_user a where a.user_id = auth.uid()
  );
$$;

-- ── catalog ─────────────────────────────────────────────────
create table if not exists public.artwork (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  description text,
  image_path  text,
  detail_path text,
  created_at  timestamptz not null default now()
);

do $$ begin
  create type public.product_kind as enum ('original', 'print');
exception when duplicate_object then null; end $$;

create table if not exists public.product (
  id           uuid primary key default gen_random_uuid(),
  artwork_id   uuid not null references public.artwork(id) on delete cascade,
  kind         public.product_kind not null,
  slug         text unique not null,
  title        text not null,
  label        text,                       -- e.g. 'The original'
  summary      text,
  presentation text default 'unframed',
  edition      text,
  is_published boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.variant (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.product(id) on delete cascade,
  size_label  text not null,               -- '40 × 30 cm'
  price_cents integer not null check (price_cents >= 0),
  currency    char(3) not null default 'USD',
  stock       integer,                     -- null = made to order
  sort_order  integer not null default 0,
  unique (product_id, size_label)
);

-- ── orders (guest checkout) ─────────────────────────────────
create table if not exists public."order" (
  id          uuid primary key default gen_random_uuid(),
  reference   text unique not null,        -- '#M1012'
  email       text not null,
  name        text,
  status      text not null default 'awaiting_fulfilment',
  total_cents integer not null check (total_cents >= 0),
  currency    char(3) not null default 'USD',
  created_at  timestamptz not null default now()
);

create table if not exists public.order_item (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public."order"(id) on delete cascade,
  variant_id   uuid references public.variant(id) on delete set null,
  qty          integer not null check (qty > 0),
  unit_cents   integer not null check (unit_cents >= 0),
  -- Denormalised copy at time of purchase. A later price/title change
  -- must never rewrite a historical order.
  snapshot     jsonb not null default '{}'::jsonb
);

-- ── indexes ─────────────────────────────────────────────────
create index if not exists idx_product_published on public.product (is_published, sort_order);
create index if not exists idx_variant_product   on public.variant (product_id, sort_order);
create index if not exists idx_order_created     on public."order" (created_at desc);
create index if not exists idx_order_item_order  on public.order_item (order_id);

-- ── Row Level Security ──────────────────────────────────────
alter table public.artwork    enable row level security;
alter table public.product    enable row level security;
alter table public.variant    enable row level security;
alter table public."order"    enable row level security;
alter table public.order_item enable row level security;
alter table public.admin_user enable row level security;

-- admin_user: nobody reads it through the API except admins.
drop policy if exists admin_user_self_read on public.admin_user;
create policy admin_user_self_read on public.admin_user
  for select using (public.is_admin());

-- Catalog: anonymous visitors may read only published products.
drop policy if exists artwork_public_read on public.artwork;
create policy artwork_public_read on public.artwork
  for select using (
    exists (
      select 1 from public.product p
      where p.artwork_id = artwork.id and p.is_published
    )
  );

drop policy if exists product_public_read on public.product;
create policy product_public_read on public.product
  for select using (is_published);

drop policy if exists variant_public_read on public.variant;
create policy variant_public_read on public.variant
  for select using (
    exists (
      select 1 from public.product p
      where p.id = variant.product_id and p.is_published
    )
  );

-- Catalog writes: admins only.
drop policy if exists artwork_admin_write on public.artwork;
create policy artwork_admin_write on public.artwork
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists product_admin_write on public.product;
create policy product_admin_write on public.product
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists variant_admin_write on public.variant;
create policy variant_admin_write on public.variant
  for all using (public.is_admin()) with check (public.is_admin());

-- Orders: any visitor may create an order (guest checkout),
-- but only admins may read or update them.
drop policy if exists order_guest_insert on public."order";
create policy order_guest_insert on public."order"
  for insert with check (true);

drop policy if exists order_admin_read on public."order";
create policy order_admin_read on public."order"
  for select using (public.is_admin());

drop policy if exists order_admin_update on public."order";
create policy order_admin_update on public."order"
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists order_item_guest_insert on public.order_item;
create policy order_item_guest_insert on public.order_item
  for insert with check (true);

drop policy if exists order_item_admin_read on public.order_item;
create policy order_item_admin_read on public.order_item
  for select using (public.is_admin());

-- ── reference numbers ───────────────────────────────────────
create sequence if not exists public.order_ref_seq start 1000;

create or replace function public.next_order_reference()
returns text
language sql
volatile
as $$ select '#M' || lpad(nextval('public.order_ref_seq')::text, 4, '0'); $$;

-- ============================================================
-- Seed — mirrors the content currently hard-coded in the pages.
-- Kept UNPUBLISHED because it is an artist-unconfirmed preview.
-- Flip is_published once details are confirmed.
-- ============================================================
insert into public.artwork (slug, title, description, image_path)
values (
  'stroke-and-surface',
  'A study in stroke & surface',
  'Dark, sweeping forms meet a richly textured ground.',
  'assets/artwork.jpg'
)
on conflict (slug) do nothing;

insert into public.product (artwork_id, kind, slug, title, label, summary, presentation, edition, is_published, sort_order)
select a.id, 'original', 'original-calligraphy', 'Original calligraphy', 'The original',
       'The source artwork. Explore its surface, gesture and individual marks.',
       'unframed', 'Not specified · artist confirmation required', false, 1
from public.artwork a where a.slug = 'stroke-and-surface'
on conflict (slug) do nothing;

insert into public.product (artwork_id, kind, slug, title, label, summary, presentation, edition, is_published, sort_order)
select a.id, 'print', 'fine-art-print', 'Fine-art print', 'The print',
       'The same composition, considered for a print. Choose a size for your space.',
       'unframed', 'Edition status to be confirmed', false, 2
from public.artwork a where a.slug = 'stroke-and-surface'
on conflict (slug) do nothing;

insert into public.variant (product_id, size_label, price_cents, sort_order)
select p.id, '40 × 30 cm', 45000, 1 from public.product p where p.slug = 'original-calligraphy'
on conflict (product_id, size_label) do nothing;

insert into public.variant (product_id, size_label, price_cents, sort_order)
select p.id, '40 × 30 cm', 6500, 1 from public.product p where p.slug = 'fine-art-print'
on conflict (product_id, size_label) do nothing;

insert into public.variant (product_id, size_label, price_cents, sort_order)
select p.id, '60 × 45 cm', 9500, 2 from public.product p where p.slug = 'fine-art-print'
on conflict (product_id, size_label) do nothing;

-- ============================================================
-- AFTER creating your admin login (Authentication -> Users ->
-- Add user, with email + password), grant admin rights:
--
--   insert into public.admin_user (user_id)
--   select id from auth.users where email = 'you@example.com';
-- ============================================================
