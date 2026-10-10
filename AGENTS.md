# AGENTS.md — muhsingraphy

## Repo
- GitHub: `heyy-ashii/muhsingraphy` (public). Default branch `main`; work happens on `OpenHand`.
- Static site, no build step: `index.html` + `styles.css` + `script.js` + `assets/`.

## Run / preview
```bash
python -m http.server 8899   # open http://localhost:8899
```

## Design source
- Figma: `MVhsQ2DLjUmlIwpaS7Vy7t` ("Untitled").
- The file is **private** and blocked (CloudFront 403) without a `FIGMA_TOKEN`. The current
  implementation was reconstructed from the public **thumbnail render** (color/geometry) plus OCR,
  not from the file itself. Treat it as an approximation until the token is provided.

## Design system
- Palette: cream `#f6f5ee`, cream-2 `#ecebe2`, ink `#0f0d0c`, gray `#8d8a82`. Monochrome only.
- Type: display `Anton` (heavy condensed, lowercase), body `Manrope`, indexing `Space Mono`.
- Motifs: hairline `1px` rules under every block, monospace lowercase labels, big `*` footnote mark.

## Conventions
- Vanilla HTML/CSS/JS only — no frameworks, no dependencies.
- All animation is CSS + `IntersectionObserver`; respect `prefers-reduced-motion`.
- Placeholder art lives in `assets/` as SVG; swap for real project images (keep 4:5, wide 16:8).
