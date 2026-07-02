# Nava brand fonts (licensed — not committed)

The app's type stack prefers Nava's official fonts and falls back to close free
faces until the licensed files are added:

| Role  | Nava font          | Free fallback (loaded today) |
| ----- | ------------------ | ---------------------------- |
| Sans  | **GT America**     | Inter                        |
| Serif | **FreightText Pro**| Source Serif 4               |

GT America and FreightText Pro are **commercial fonts** and are intentionally
**not** committed to this repo. To activate the real Nava typography:

1. Obtain the licensed **web** font files (`.woff2`) and place them here:

   ```
   public/fonts/gt-america/GT-America-Regular.woff2   (400)
   public/fonts/gt-america/GT-America-Medium.woff2    (500)
   public/fonts/gt-america/GT-America-Bold.woff2      (700)
   public/fonts/gt-america/GT-America-Black.woff2     (900)
   public/fonts/freight-text-pro/FreightText-Book.woff2  (400)
   public/fonts/freight-text-pro/FreightText-Bold.woff2  (700)
   ```

2. Uncomment the `@font-face` block in [`src/index.css`](../../src/index.css).

No other change is needed — the `--font-sans` / `--font-serif` stacks already
list `"GT America"` / `"FreightText Pro"` first, so they take over automatically
once the faces load. Filenames above must match the `@font-face` `src` URLs; if
yours differ, adjust either the files or the CSS to match.
