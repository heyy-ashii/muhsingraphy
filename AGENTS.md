# AGENTS.md — muhsingraphy

## Repo
- GitHub: `heyy-ashii/muhsingraphy` (public). Default branch `main`; work happens on `OpenHand`.
- Static multi-page site, no build step.

## Run / preview
```bash
python -m http.server 8899   # http://localhost:8899
```

## Pages
| File | Figma frame |
|---|---|
| `index.html` | Muhsingraphy — Homepage (1440×6014) |
| `shop.html` | Muhsingraphy — Shop (1440×2073) |
| `original-calligraphy.html` | Muhsingraphy — Original calligraphy (1440×2654) |
| `fine-art-print.html` | Muhsingraphy — Fine-art print (1440×2672) |
| `admin.html` | Muhsingraphy — Admin overview (1440×1133) |

Shared: `styles.css`, `script.js`, `assets/artwork.jpg` (the supplied artwork).

## Design source
- Figma file `MVhsQ2DLjUmlIwpaS7Vy7t` ("Untitled"). Built from the real file via the
  Figma REST API (personal access token with `file_read`).
- Fonts: display `Lora` (400), body `Inter` (400/500), via Google Fonts.
- Palette (sampled from the file):
  `--ink #163c3d`, `--sage #69726c`, `--rule #d5d8ce`, `--rule-dark #46605b`,
  `--paper #fdfcf8`, `--paper-2 #eeece4`, `--mist #e3e8df`,
  `--on-ink #f7f5ef`, `--on-ink-dim #e9eee5`, `--amber #896131`.
- Layout: 1440px max, 32px gutter (`--gut`), hairline `1px #d5d8ce` rules.
- Recurring motifs: uppercase 11px labels, `↗` link arrows, arrow-right buttons.

## Notes / limitations
- This is a **concept preview**: much copy is explicitly "to be confirmed", prices are
  samples in USD, and the same supplied image is reused for artwork, detail crop and the
  print. Swap in real asset variants when available.
- Cart, filters, tabs and the FAQ accordion are client-side only — no backend.
- `admin.html` is a demo workspace (sample data).

## Conventions
- Vanilla HTML/CSS/JS only. Reveal-on-scroll via `IntersectionObserver`; respect
  `prefers-reduced-motion`.
- Keep content changes aligned with the Figma file where possible.
