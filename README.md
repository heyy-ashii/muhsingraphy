# muhsingraphy

A portfolio and collection preview for a calligrapher, built from the Figma
design `MVhsQ2DLjUmlIwpaS7Vy7t`. Static, dependency-free HTML/CSS/JS.

## Pages

| File | Figma frame |
|---|---|
| `index.html` | Homepage |
| `shop.html` | Shop / collection |
| `original-calligraphy.html` | Original calligraphy |
| `fine-art-print.html` | Fine-art print |
| `admin.html` | Studio admin overview |
| `account.html` | Sign in / register + chat with the studio |

## Run

```bash
python -m http.server 8899     # http://localhost:8899
```

Everything works with no configuration — the pages ship with their own content.

## Optional: connect Supabase

The site can load its catalogue and record guest orders through Supabase. This
is **off by default** and the site behaves identically without it.

1. **Create the schema.** Paste `supabase/schema.sql` into the Supabase SQL
   editor and run it. This creates the tables, enables **Row Level Security** on
   every one, and adds the policies described below.
2. **Add your public key.** In `supabase-config.js`, set `supabaseUrl` and
   `supabasePublishableKey`. Reload. The shop, product pages and admin
   overview now read live data.
3. **Publish content.** Seeded rows start unpublished (the design is an
   unconfirmed preview). Flip `is_published` when you are ready:
   ```sql
   update public.product set is_published = true;
   ```
4. **Create the admin login.** Register normally at `account.html`, then
   promote the account (see `supabase/auth-chat.sql`):
   ```sql
   update public.profile set role = 'admin' where email = 'you@example.com';
   ```

## Accounts and chat (optional)

Run `supabase/auth-chat.sql` *after* `supabase/schema.sql`. It adds:

- `profile` — one row per user, created automatically on signup, holding
  `email`, `phone`, `display_name` and `role` (`user` or `admin`).
- `thread` / `message` — one conversation per user with the studio.
  Signed-in customers use `account.html`; the studio replies from the
  **Customer messages** panel in `admin.html`.

Signup takes an email, a password and an optional phone number. **Email
confirmation and phone OTP are disabled** — the account is usable immediately,
and one account is allowed per email and per phone number (enforced by unique
constraints).

### ⚠️ Consequence of disabling verification

With no verification, nothing proves a registrant owns the address or number
they enter. Because each email and phone may only be used once, **anyone can
register a contact detail that belongs to someone else and permanently block
the real owner from registering it.** There is also no password reset, since
that requires reading the mailbox.

Before this handles real customers: re-enable email confirmation
(Authentication → Providers → Email → *Confirm email*), and treat phone as an
unverified contact field rather than an identity. Supabase Auth cannot do
OTP-free phone login; phone-only signup requires either SMS OTP or a custom
flow.

### Role safety

`role` lives in `profile` and is guarded by the `profile_protect` trigger.
RLS cannot restrict single columns, so without that trigger a user could grant
themselves admin with one `UPDATE`. Do not remove it.

### Chat delivery

Messages are fetched by polling every 5–6 seconds, keeping the site
dependency-free. Supabase Realtime (a WebSocket subscription) is the upgrade
path when instant delivery matters.

### Security model

- Only the **publishable key** is used in the browser. It is public by design,
  so it is safe *only* because Row Level Security is enabled on every table.
- The **secret key** (`sb_secret_…`) is not used anywhere in this project and
  must never be added to it. It bypasses RLS entirely. Privileged, server-side
  work belongs in an Edge Function.
- Anonymous visitors can read published products and create an order. Only an
  authenticated admin can read orders or write the catalogue.
- Never commit keys to this repository — it is public.

## Structure

```
index.html  shop.html  ...           pages
account.html  account.js             auth + customer chat
admin-chat.js                        studio chat inbox
styles.css                           design system
script.js                            UI interactions (tabs, filters, FAQ)
supabase-config.js                   public client config (placeholders)
store.js                             REST + Auth data layer, no dependencies
hydrate.js                           swaps static content for live data
supabase/schema.sql                  tables, RLS policies, seed
supabase/auth-chat.sql               profiles, roles, chat, RLS
assets/                              artwork
```
