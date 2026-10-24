# Slice 2 — Multi-select food, About/Privacy, location & map ✅

_Moved from `PLAN.md` on 2026-10-24, as it stood._

### Phase 2a — food, pages, privacy plumbing (no new runtime dependencies) ✅

| # | Step | Status |
|---|---|---|
| 1 | `LICENSE` (MIT, "The kingofwees.com contributors") + root `README.md` | ✅ |
| 2 | Multi-select food: API `foods[]` (each valid, no duplicates); old dev documents still read; toggle buttons with check marks + "Log feeding"; "Wet food and Treats" via `formatList` | ✅ |
| 3 | No stale status: Done/Back/Undo show Home only after the fresh status arrives | ✅ |
| 4 | Telemetry scrubbing: `PersonalDataScrubber` strips `client.address`, `client.port`, `user_agent.original`, `url.query` before export | ✅ |
| 5 | Routing: server fallback to `index.html` (unknown `/api` stays 404); History-API router for `/`, `/about`, `/privacy`; translated titles; page `h1` focus; footer with credit + About/Privacy links (pulled forward from step 6); e2e proves links don't reload | ✅ |
| 6 | About + Privacy page content: story, how it works, honor system, privacy promises; contact by **email**; entries **kept for King's history**, removal on request (contact email was a placeholder; the real one landed 2026-10-08 in d4406ff, `source/frontend/src/site.ts`) | ✅ |
| 7 | Docs (`source/README.md`: API, routes, layout); StrykerJS 77.8% (138 survivors, nearly all equivalent; 3 real gaps closed); incremental mode on | ✅ |
| 8 | Home tagline from the mood board: "A whimsical, neighborly way to keep track of King…" (Wallie's request) | ✅ |

**Stop for review** after 2a.

### Phase 2b — who fed, location, feeding spots, map ✅

| # | Step | Status |
|---|---|---|
| 1 | **Optional nickname ("who fed / who saw")**: asked once per device on the first log ("What should neighbors call you? A first name or nickname" + big Skip), remembered in the browser, sent as `reporterName` (server already validates ≤ 40); "Logging as Sarah · change" on the confirmation screen; Lately shows "Fed by Sarah". **Privacy page must change** ("We don't ask for your name" → names are optional, shown publicly, use a first name or nickname; parents: suggest a nickname for kids). Tests incl. Skip path, change path, privacy promise, axe. **Fed means seen (option C):** a feeding counts as a sighting unless the feeder ticks "I left food out (didn't see him)" (off by default) — new `sawKing` flag on feedings (missing → true for old data). Status `lastSeen` = newest sighting **or** seen-feeding. Home chips: if the latest sighting *is* the feeding → one chip "Fed & seen {when}"; if a sighting is newer → "Fed {when}" · "Seen {when}"; left-food-out feedings never move "Seen". Tests: store contract, API status rules, chip rules, toggle default, perturbation. Also: the E2E project was never committed (`.gitignore` `*.e2e` matched it case-insensitively) — now un-ignored; axe scans wait for transitions to settle (a mid-fade button failed contrast); stale tagline test/catalog fixed to the source's "neighborhood". | ✅ |
| 2 | Location privacy rule: round to 3 decimals (~a block) on client **and** server before storing; rule in `CLAUDE.md` files, why in `docs/patterns/location-privacy.md`. Server: `GeoPoint` rounds in its constructor (so binding, reads and config all round); client: `roundToBlock`; both half away from zero | ✅ |
| 3 | Feeding spots: `spots` collection, `GET/POST /api/king/spots`, anyone can add while logging; feeding `spotId` validated with `MustAsync`. `GeoPoint` coordinates are `[JsonRequired]` (a missing one would read as 0,0) | ✅ |
| 4 | Sightings: optional rounded `location`; status returns it and the feeding's spot name (a feeding's `location` is its spot's) | ✅ |
| 5 | Map config `GET /api/king/map` from `King:Map:Center` (user-secrets/env, **not** in the public repo). Server user-secrets (verified the Aspire-run server reads them); 404 when unset | ✅ |
| 6 | UI: Fed → foods → spot (last used preselected) or "Somewhere new"; Seen → "I'm near him now" / tap map / Skip; home mini-map; keyboard "Use map center". Spot shown on the feed screen as "At {spot} · change" (last used preselected per device); Leaflet controls translated. Fixed from Wallie's manual test: the home map now fits all its markers (a sighting a few hundred meters from the feeding spot was drawn off-screen); API tests ignore the developer's user-secrets. Added at Wallie's request: Lately says "near {spot}" for a sighting within 150 m (about a block) of a saved spot; home order is status → buttons → map → Lately; the map has a "Last fed & seen" heading and a worded key ("● Fed 1 hour ago · at Porch"), so markers never rely on color alone (WCAG 1.4.1) | ✅ |
| 7 | Privacy page: map tiles load from OpenStreetMap (they see your IP), linked policy; also: places rounded in the browser and asked for only on a tap; feeding spots are public | ✅ |
| 8 | Tests: rounding, validators, spot store contract, API, Vitest with fake geolocation, Playwright geolocation + axe — written test-first inside steps 1–7 (e2e stubs OSM tiles, injects a made-up map center, proves the browser sends only rounded coordinates) | ✅ |

New dependency: **Leaflet** (+ `@types/leaflet`), used directly — no `react-leaflet`.

StrykerJS (phase end): scope narrowed to logic files (588 → 201 mutants, ~37 → ~10 min). 84% detected across those files, 0 timeouts outside `App.tsx`; 4 real gaps closed (footer on new screens, map URL, geolocation timeout, spots-load failure), the other survivors equivalent (translator descriptions, dependency arrays, the single-locale browser match, optional chaining inside `try`).

**Stop for review** after 2b.
