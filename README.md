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
4. **Create the admin login.** Authentication → Users → Add user. Then grant
   admin rights:
   ```sql
   insert into public.admin_user (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

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
styles.css                           design system
script.js                            UI interactions (tabs, filters, FAQ)
supabase-config.js                   public client config (placeholders)
store.js                             REST + Auth data layer, no dependencies
hydrate.js                           swaps static content for live data
supabase/schema.sql                  tables, RLS policies, seed
assets/                              artwork
```
