# Fonts - osu!lazer typeface (Torus)

The editor's UI font is **Torus** (with **Torus-Alternate**), the typeface used by
osu!lazer. Torus is a **proprietary font** and is *not* bundled with this project,
so it cannot be redistributed here.

The app still uses it when available: the CSS `@font-face` rules in
[`src/index.css`](../../src/index.css) resolve each Torus weight from a locally
installed copy first, then from this folder. When Torus is not present the font
stack falls through to **Inter** (also part of lazer's font set, loaded from
Google Fonts in `index.html`), then the system sans-serif.

## Enabling real Torus

If you own a license to Torus, drop the `.woff2` files here with these exact
names and they'll be picked up automatically:

```
public/fonts/
  Torus-Regular.woff2
  Torus-Light.woff2
  Torus-SemiBold.woff2
  Torus-Bold.woff2
  Torus-Alternate-Regular.woff2
```

(`.woff2` is recommended; convert from `.otf`/`.ttf` if needed and update the
`format()` hints in `src/index.css` accordingly.)

Without these files everything works fine - you just see Inter instead of Torus.
