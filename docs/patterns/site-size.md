# Site size

**Decided:** 2026-10-12, Slice 6 step 8b, after Wallie asked why a site that does little built to 493 kB.

## What was measured

On the live site the main script (481 kB) and stylesheet (295 kB) were sent **uncompressed and with no cache header** — every visit downloaded them whole. The script was 40% react-dom, 29% Leaflet (loaded on every visit, map or not), 17% the site's own code (13 kB of it translator descriptions), 11% react-intl/formatjs. Of the stylesheet, ~130 kB was daisyUI's button copied 18 times. Home's picture of King was 194 kB, shown 88 px wide. A first visit to Home was about 1.07 MB.

## Compressed once, at build

The frontend build writes a brotli (quality 11) and a gzip (level 9) copy beside each built script and stylesheet (`source/frontend/build/precompress.ts`, a Vite plugin on Node's own zlib — no new dependency). The server (`SpaFiles.cs`) sends the copy the browser accepts best (brotli on a tie; `q=0` refuses one; `*` accepts any), with the original's content type, `Content-Encoding` and `Vary: Accept-Encoding`. Rejected: compressing per request (`UseResponseCompression`) — on 0.25 vCPU it costs CPU on every visit, and the fast levels compress worse. Rejected: `MapStaticAssets` — it builds its manifest at publish, and the SPA joins the image after publish (`infra/deploy.sh`).

If the build ever stops writing the copies, the server quietly sends the plain files and every test still passes — so `infra/smoke.sh` checks that the live main script arrives as brotli. Tailwind scans every project file for class names, so `index.css` excludes `build/` and Markdown (`@source not`): the plugin's words became 0.9 kB of utilities, and the word `btn` in the frontend `CLAUDE.md` brought back a whole standalone daisyUI button (7.6 kB).

## Cached for good, pages rechecked

Vite names every file under `/assets/` after its content, so a changed file is a new address: those are `public, max-age=31536000, immutable`. Pages (`/`, `index.html`, deep links) are `no-cache` — the browser asks every time and gets a 304 when nothing changed — so a deploy reaches everyone at once. A missing `/assets/` file (a page loaded before a deploy asking for a script that's gone) is a 404, not the page: `MapFallbackToFile` only catches paths that don't look like files.

## Leaflet on demand

`MapView` loads the first time a map shows (`LazyMapView.tsx`), behind an empty frame of the map's height. A direct import would put ~150 kB back into every visit with nothing failing, so lint refuses it (`@typescript-eslint/no-restricted-imports`; type imports allowed). The bundler also splits out a 59 kB chunk shared by the main script and the map (`icons-*.js`), which every visit loads.

## One shared button rule

`@apply btn` copies daisyUI's whole button — every state and variant, ~7 kB — into the rule that applies it. The 18 button-like classes now share one `@apply btn` at the top of `@layer components` and apply only their own variants and sizes. Checked in Chromium before and after: every computed style (element, `::before`, `::after`) of every class in each state it's used in — normal, hover, keyboard focus, disabled, pressed, checked — on the element types the app uses (button, link, label with a radio or file input): 0 differences; the same check found two deliberately added 1-line rules.

## Results

| | Before | After |
|---|---|---|
| Scripts every visit loads | 493 kB (125 kB brotli) | 342 kB (90 kB brotli) |
| Stylesheet | 295 kB (39 kB brotli) | 153 kB (31 kB brotli) |
| Home's picture of King | 194 kB | 16 kB (176 px square, the same framing) |
| Sent on the wire | uncompressed | brotli or gzip |

## Not done

Trimming daisyUI to the components in use (`include:`) saves 41 kB but makes any daisyUI class used later silently unstyled. Stripping translator descriptions (13 kB) needs a build plugin. The `@font-face` rules for every language subset (29.5 kB of CSS; only Latin files download) and the 194 kB picture on the sighting confirmation remain.
