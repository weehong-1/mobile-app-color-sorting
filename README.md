# Icon sorter

Upload a screenshot of a phone home screen; get the same screen back with its
app icons sorted by colour on a background you choose. The icons are the real
pixels cropped out of your screenshot, not lookalikes.

Everything runs in the browser tab. No uploads, no server, no accounts.

## Setup

```sh
npm install
npm run dev      # development server
npm test         # unit and acceptance tests
npm run build    # typecheck, then a static site in dist/
npm run preview  # serve the built site
npm run debug    # run the pipeline over the fixtures, write debug/ and print the tables
```

Node 20 or newer. There are no runtime dependencies; `vite`, `typescript`,
`vitest` and `sharp` are all development-only.

## Deploying

The build is a plain static site with no server-side anything, so any static
host works.

- **Cloudflare Pages** — build command `npm run build`, output directory `dist`.
- **Vercel** — framework preset "Vite", build command `npm run build`, output
  directory `dist`.

No environment variables, no adapters, no configuration.

## Your screenshot stays on your device

This is enforced rather than promised, and you can check it:

- There are **no runtime dependencies**, no web fonts and no CDN references.
  `grep -r "https://" dist/` after a build comes back empty.
- The built bundle contains no `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource` or `sendBeacon` call at all. Vite's module-preload polyfill,
  the only thing that introduced one, is switched off in `vite.config.ts`.
- `index.html` carries a Content-Security-Policy with `connect-src 'none'` and
  `default-src 'none'`, so the page is incapable of making a request even if
  something later tried.
- Open devtools' network panel and use the app: nothing is requested after the
  page itself loads.

The only thing kept between visits is your choice of background colour, sort
order, dark threshold and theme, in `localStorage`. No image data is stored.

## How it works

The pipeline is a chain of pure functions over raw RGBA, so the same code runs
in the browser and under Vitest against the fixture screenshots.

1. **Detect the grid.** Gradient projections over a downscaled working copy.
   Columns come from a brute-force search over left edge, icon size and pitch;
   rows from fitting a lattice to detected row bands, which is what lets a page
   with empty rows in the middle work (see `docs/adr/0005`).
2. **Decide which slots hold icons**, by the gradient energy inside each one,
   split where the scores most obviously separate.
3. **Crop each icon** at full resolution through a rounded-corner mask, together
   with any notification badge overhanging its corner. A sprite can therefore be
   larger than the slot it came from.
4. **Measure its colour** in OKLab: the dominant colour by area, and an accent —
   the largest genuinely coloured region that differs from it — used to order
   icons that share a white or dark dominant.
5. **Sort**, by one of five orders. *Rainbow, grouped* is the default;
   *Colour families* groups chromatic icons into the hue families of a palette
   and runs each family pale to deep, the way a printed colour chart is laid
   out. Neutrals keep their own rules in both.
6. **Lay out** the sorted icons: packed into a block from the top-left (the
   default), into the slots that were occupied before so the page keeps its
   shape, or sorted within each row so nothing leaves the row it started in.
7. **Compose** onto the chosen background.
8. **Optionally lift the app names** out from under each icon. They are white
   text over a blurred wallpaper with no matte to recover, so the background is
   estimated per block and the text solved for per channel; taking the minimum
   across channels is what rejects the blue "new app" dot and drop shadows. The
   recovered letterforms are redrawn in a colour that contrasts with your
   background.

`CONTEXT.md` defines the vocabulary. `docs/adr/` records the decisions that a
reader would otherwise find surprising, and `docs/acceptance-criteria.md` is
what the tests check.

## Colour

Phone screenshots are usually **Display P3**, not sRGB, and the app works in P3
throughout: a `display-p3` canvas, and OKLab conversion using P3 primaries.
Converting to sRGB would clip the most saturated reds and greens, and clipping
collapses distinct hues onto the same value — exactly the information a hue sort
depends on.

Browsers without a `display-p3` canvas (Firefox, at the time of writing) fall
back to sRGB automatically and silently. The result is still correct and still
made of your screenshot's own pixels; the most vivid icons may order slightly
differently. Exported PNGs are checked for a colour profile, and if one is
missing the app re-exports through sRGB rather than hand you an untagged P3 file,
which would look washed out everywhere.

## Palettes

The *Colour families* order groups icons against a palette. A palette of seven
hue families in six steps is built in, generated from rules rather than copied
from anywhere; you can paste your own list instead, one colour per line:

```
#1b4f9c Deep blue
#e8c34a, Yellow
2f7a3a   Green
```

The hex must start the line; anything after it is the name. Blank lines and
`//` comments are ignored (`#` is not a comment marker, since it starts a hex
value). Families are clustered from whatever palette is loaded, so a pasted list
genuinely changes the grouping and not just the names — but colours whose hues
sit within about fifteen degrees of each other are merged into one family, so
four near-identical reds give one red family rather than four.

Two things worth knowing about what the palette does and does not do. Order
inside a family is by an icon's own lightness, so the palette's **steps name
colours but never move them** — only the family boundaries affect the order.
And neutrals never go through the palette at all, which on a typical home screen
is most of the icons.

The built-in palette is not Pantone and does not claim to match it. Pantone's
colour values are licensed and are not distributed here; if you have them, paste
them in. See `docs/adr/0006`.

## Known limits

Tested against two iPhone home screen screenshots, 1284×2778, four columns.

- **Widgets** are read as several ordinary icons, one per slot they cover. Turn
  those squares off in step 2.
- **Folders** are sorted like any other icon, by whatever their grid of
  mini-icons averages to, which is usually a muddy mid-tone.
- **Dock icons** are not included, and nor are the status bar or page-indicator
  dots. Those areas come out as plain background.
- **Only one page at a time.** Sorting across several home screens is not
  supported.
- **iOS 18 dark and tinted icon modes** are untested. Tinted mode in particular
  makes every icon nearly the same hue, so the sort has little to work with.
- **iPad grids** are untested. The column count can be set up to six, but the
  detection ranges were tuned on phone screenshots.
- **Notification badges** are found only when they overhang the icon's top-right
  corner and are the standard red. A badge on a similarly red icon is skipped
  rather than risk masking the whole tile.
- **App names** are off by default. They are recovered from the screenshot
  rather than retyped, so a name over an unusually bright patch of wallpaper can
  come out faint or missing. Nothing is substituted when that happens: the app
  only ever shows real pixels from your screenshot.
