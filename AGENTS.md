# AGENTS.md — muhsingraphy

## Repo
- GitHub: `heyy-ashii/muhsingraphy` (public). Work happens on `OpenHand`.
- Static multi-page site, **no build step, no npm dependencies**. Keep it that way.

## Run / preview
```bash
python -m http.server 8899   # http://localhost:8899
```

## Pages
| File | Figma frame |
|---|---|
| `index.html` | Homepage |
| `shop.html` | Shop / collection |
| `original-calligraphy.html` | Original calligraphy |
| `fine-art-print.html` | Fine-art print |
| `admin.html` | Admin overview |
| `account.html` | Sign in / register + chat |

## Scripts (load order matters)
1. `supabase-config.js` — public config, **placeholders only**
2. `store.js` — dependency-free PostgREST + Supabase Auth client
3. `script.js` — UI interactions (tabs, FAQ, filters, qty)
4. `hydrate.js` — catalogue/orders; `account.js` on account.html;
   `admin-chat.js` on admin.html

## Design source
Figma `MVhsQ2DLjUmlIwpaS7Vy7t`. Display `Lora`, body `Inter`.
Palette: ink `#163c3d`, sage `#69726c`, rule `#d5d8ce` / `#46605b`,
paper `#fdfcf8`, paper-2 `#eeece4`, mist `#e3e8df`, on-ink `#f7f5ef` /
`#e9eee5`, amber `#896131`. Layout 1440px, 32px gutter.

## Data / backend
- Supabase, **Option A: static + RLS**. Schema in `supabase/schema.sql`,
  accounts + chat in `supabase/auth-chat.sql` (run second).
- Public catalogue reads use the **publishable key**. Guest orders insert
  directly under an insert-only RLS policy. Admin reads require a signed-in
  user with `profile.role = 'admin'`.
- **Never** put the secret key (`sb_secret_…`) in a client file, `.env`, or this
  repo. It bypasses RLS. Privileged work belongs in an Edge Function.
- `profile.role` is protected by the `profile_protect` trigger. RLS is
  column-blind, so that trigger is the only thing stopping self-promotion to
  admin — never remove it.
- Verification (email confirmation + phone OTP) is **disabled by request**.
  Phone is therefore unverified data, not an identity. See README.
- `hydrate.js` must stay **fail-open**: if Supabase is absent or unreachable,
  log a warning and leave the static markup in place. A visitor must never see a
  broken page because the backend is down.

## Conventions
- Vanilla HTML/CSS/JS only; no frameworks, no bundler.
- Escape all interpolated data (`esc()` in `hydrate.js`) — never `innerHTML` raw.
- Respect `prefers-reduced-motion`.

## Content caveat
Concept preview: prices are sample USD values, much copy is "to be confirmed",
and one image is reused for artwork / detail / print. `admin.html` uses demo data.
