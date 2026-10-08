# King of Wees — Plan

**Status key:** ✅ done · 🔄 in progress · ⏳ pending · ⏸️ waiting on a decision

**Now:** Slices 1–3 committed and pushed on `main`; real contact email in. Only Slice 3's phase-end StrykerJS run remains — stopped again at 44/589 mutants, so no score is recorded yet. Last updated 2026-10-08.

---

## Slice 1 — Walking skeleton + "I fed / I saw King" ✅

| # | Step | Status |
|---|---|---|
| 1 | Scaffold: Aspire 13.6 (`aspire new`), `.slnx`, Central Package Management, `Directory.Build.props` (warnings = errors), Bun package manager (7-day release gate, no install scripts) | ✅ |
| 2 | Test harness: xUnit v3 (Microsoft.Testing.Platform), Playwright + axe e2e booting the real AppHost | ✅ |
| 3 | MongoDB in Aspire (`PersistData=false` for tests) | ✅ |
| 4 | Domain + minimal API: feedings, sightings, status, undo (10 min, same device); `CanPost` policy; rate limit; metrics; FluentValidation with error codes | ✅ |
| 5 | Frontend foundation: Tailwind v4 + daisyUI `king` theme, self-hosted fonts, lint bans inline styles and literal text | ✅ |
| 6 | i18n: react-intl, `en-XA` pseudo-locale, catalog-freshness test | ✅ |
| 7 | Screens: home, feed, logged; double-tap guards; focus management | ✅ |
| 8 | E2E: kid flow, undo, keyboard-only, WCAG 2.2 AA on every screen, target size, pseudo-locale | ✅ |
| 9 | Docs: folder READMEs, `docs/patterns/validation.md` | ✅ |
| 10 | Mutation testing: StrykerJS (command runner); Stryker.NET dropped (no MTP support) | ✅ |

## Slice 2 — Multi-select food, About/Privacy, location & map ✅

### Phase 2a — food, pages, privacy plumbing (no new runtime dependencies) ✅

| # | Step | Status |
|---|---|---|
| 1 | `LICENSE` (MIT, "The kingofwees.com contributors") + root `README.md` | ✅ |
| 2 | Multi-select food: API `foods[]` (each valid, no duplicates); old dev documents still read; toggle buttons with check marks + "Log feeding"; "Wet food and Treats" via `formatList` | ✅ |
| 3 | No stale status: Done/Back/Undo show Home only after the fresh status arrives | ✅ |
| 4 | Telemetry scrubbing: `PersonalDataScrubber` strips `client.address`, `client.port`, `user_agent.original`, `url.query` before export | ✅ |
| 5 | Routing: server fallback to `index.html` (unknown `/api` stays 404); History-API router for `/`, `/about`, `/privacy`; translated titles; page `h1` focus; footer with credit + About/Privacy links (pulled forward from step 6); e2e proves links don't reload | ✅ |
| 6 | About + Privacy page content: story, how it works, honor system, privacy promises; contact by **email**; entries **kept for King's history**, removal on request (contact email is a placeholder) | ✅ |
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

## Slice 3 — History page: heat map + full log 🔄

One `/history` page: a heat map of where King is seen / fed, then the full log. The home map stays as it is — only "Last fed & seen", two markers. Here it's every entry with a place, counted per block. No new dependencies.

| # | Step | Status |
|---|---|---|
| 1 | **Store paging:** `GetPageAsync(before, limit)` — newest first, sorted by `OccurredAtUtc` then `Id` (ties never skip or repeat); `before` is the last event's id. Contract tests on Mongo and the in-memory double. Replaces `GetRecentAsync` (status reads the first page) | ✅ |
| 2 | **`GET /api/king/history?before=&limit=`** → `{ events: EventView[], next: string \| null }`, same `EventView` (spot name, location) as status. `[AsParameters] HistoryQuery` with a FluentValidation validator: `limit` 1–100 (default 50), unknown `before` → `before.unknown`. Extend the guard test to cover `[AsParameters]` types, not just bodies | ✅ |
| 3 | **Heat counts in the store:** sightings grouped by rounded place, `Ne(SawKing, false)` (a seen-feeding counts at its spot's location, merged with sightings in the same block); feedings grouped by `SpotId` (every feeding, left-out included). Entries with no place are left out. Optional `since`. Mongo aggregation; contract tests incl. pre-flag documents and a left-out feeding (absent from Seen, present in Fed) | ✅ |
| 4 | **`GET /api/king/heat?layer=seen\|fed&days=7\|30`** (no `days` = all time) → `{ cells: [{ location, count, spotName? }] }`, most first. `HeatQuery` validator: `layer.invalid`, `days.invalid` (only 7 or 30). Fed cells carry the spot name; seen cells are blocks, named by the page | ✅ |
| 5 | **Route `/history`:** translated title, `PageShell`, focused `h1`; "See King's history" link under Lately on Home, plus a footer link. Routing tests in Vitest; the e2e no-reload check moves to step 9 so the AppHost boots once for the slice | ✅ |
| 6 | **Heat map:** one circle per block, four sizes/shades from `heatLevel(count, max)` (pure, tested), semantic classes only; fits every cell. Switches "Where he's seen" / "Where he's fed" (opens on Seen) and "7 days" / "30 days" / "All" (opens on 30), buttons with `aria-pressed`. Written list under the map, most first — the text alternative (WCAG 1.4.1): "Porch — 23 sightings"; a block with no spot nearby is named by its distance from the nearest spot ("About 300 m from Porch"), or "Somewhere without a spot nearby" when there are no spots. Plural-aware counts via ICU. Empty state; slow answers to an earlier choice are dropped. From Wallie's manual test: blocks near the same spot fold into one place (one row, one circle at the spot — two "Near Elm & Earle" rows read as a bug), and distances are feet/miles, not metres | ✅ |
| 7 | **Full log:** grouped by day (`formatDate`, "Today" / "Yesterday"), each line as in Lately (foods, who, spot / "near {spot}", left food out); "Show older" loads the next page and moves focus to the first new entry; hidden when `next` is null; loading and error states. The activity line is shared with Lately (`ActivityItem`), so Lately now says "left food out" too; it sets its own line height (`leading-7`) so it doesn't inherit About/Privacy's relaxed prose spacing on the history page (Wallie saw the lines look different) | ✅ |
| 8 | **Privacy page:** say that the history and heat map are public (nicknames, spots and rounded places), linking the existing "kept as King's history" wording. Done as one sentence: the history page (linked) shows every entry with its name and a map of places never more exact than a block | ✅ |
| 9 | **E2E + docs:** Playwright `/history` (layers, range switch, Show older, keyboard-only), axe on every state, `en-XA`; `source/README.md` API, routes and layout. In `KingFlowTests` (one class: its flows share the database). "Show older" is covered by API and Vitest tests, not e2e: 51 more entries would push the other flows' entries out of their recent lists | ✅ |

| 10 | **"change" renames the entry just logged too** (from Wallie's manual test: changing Guy → Kael on the confirmation left that feeding as Guy). `PATCH /api/king/events/{id}` `{ reporterName }` — same device (`X-Reporter-Key`), within the 10-minute undo window, same 404/409 as Undo; store `RenameAsync`; the confirmation renames the entry, then later entries use the new name; if that fails (too late, offline) it says so and later entries still use it. Undo and rename share one ownership check. The e2e server's write limit is raised (`AppFixture`) — the suite outgrew 20 writes a minute from one address; `RateLimitTests` still covers the limit | ✅ |

Phase end: StrykerJS alone — `src/king/heat.ts` added to `mutate`. ⏳ Not finished: stopped four times so far (the last at 44/589). Stopped runs write no incremental file, so the next run is a full one — about 20–25 minutes; let it finish, then record the score here. **Stop for review** after Slice 3.

## Later ⏳

- Photos with sightings (Blob/S3 behind an interface; strip EXIF in the browser).
- "Not fed in 12 hours" alerts (Web Push; scheduled job or in-app timer depending on hosting).
- Admin delete for spam; posting key or accounts if spam appears (`CanPost` seam).
- Go-live: choose hosting A (managed free tiers) or C (one VM via Compose) — see `infra/README.md`.

---

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-08 | Build locally with Aspire; choose hosting A vs C at go-live (B ruled out). |
| 2026-10-08 | React + Vite + Tailwind + daisyUI; semantic classes, no inline styles; WCAG 2.2 AA; i18n from day one. |
| 2026-10-08 | Bun as package manager only (Node stays the runtime). |
| 2026-10-08 | `.slnx`, Central Package Management, `Directory.Build.props`. |
| 2026-10-08 | Minimal APIs only; FluentValidation only (`docs/patterns/validation.md`). |
| 2026-10-08 | Test-first with perturbation for every behavior; StrykerJS kept, Stryker.NET dropped. |
| 2026-10-08 | Public repo, MIT © "The kingofwees.com contributors". |
| 2026-10-08 | Food is multi-select. |
| 2026-10-08 | Location: Fed → named spots (anyone adds); Seen → GPS / map tap / Skip; round to ~a block before storing. |
| 2026-10-08 | Start public on an honor system; About + Privacy pages; footer credits "King's neighbors on Guy St." |
| 2026-10-08 | Contact by email (address pending); entries kept for King's history, removal on request. |
| 2026-10-08 | StrykerJS kept with incremental mode; run only at phase end, alone. |
| 2026-10-08 | `PLAN.md` is the single source of status; updated as steps start/finish, handoff prompt at every stop. |
| 2026-10-08 | "Who fed": optional nickname asked once per device, shown publicly; first step of Phase 2b. |
| 2026-10-08 | Contact email: Wallie supplies it later; the site keeps the placeholder until then. |
| 2026-10-08 | Fed means seen unless "I left food out" is ticked (option C); one "Fed & seen" chip when they're the same entry. Part of Phase 2b step 1. |
| 2026-10-08 | Location: rounded in `kingApi` (every coordinate leaves the browser there) and by `GeoPoint` on the server. Spot on the feed screen as "At {spot} · change", last used preselected per device. "I saw King" → "Where is King?" (GPS / map tap + "Log sighting here" / "Use map center" / Skip). Map center from the server's user-secrets; no map when unset. Leaflet 1.9.4 direct, circle markers, OSM tiles. |
| 2026-10-08 | StrykerJS mutates logic files only (`stryker.config.json` → `mutate`): screens and pages produced mostly equivalent mutants at ~3× the run time. Tried `@stryker-mutator/vitest-runner` 10.0.0 and reverted: it ran in 3m42s but never activated mutants under Vitest 5 (`time.ts` 9% vs 100%, same with coverage analysis off) — it was built against Vitest 4.1.10, before Vitest 5 shipped, despite its "vitest ≥ 2" peer range. Retry when a runner release lists Vitest 5 support; check that `time.ts` still scores 100% before trusting it. |
| 2026-10-08 | Name question appears when a never-asked device first taps "I fed" / "I saw", before logging. Skip (or an empty Save) is remembered as "no name" and shows "Logging as a neighbor · change". ~~"change" renames *later* entries only~~ — superseded below. |
| 2026-10-08 | "change" on the confirmation renames the entry just logged as well as later ones (reverses the 2b rule: "Logging as Guy · change" read as fixing this entry). Same device and 10-minute window as Undo. |
| 2026-10-08 | US site: distances shown in feet (to 50 ft) under a quarter mile, then miles (to 0.1) — not metres, not from the locale — until people can choose their own formats. Rule in `source/frontend/CLAUDE.md`. |
| 2026-10-08 | Heat map: the server counts per block; the page folds every block within about a block of a spot into one place at that spot, so a spot's name appears once. Blocks with no spot near stay per block. |
| 2026-10-08 | Slice 3: one `/history` page (heat map on top, log below, 50 per page). Heat drawn as one circle per rounded block, counted on the server, with a written list as the text alternative — not `leaflet.heat` (unmaintained dependency, color-only, implies finer-than-a-block precision). Layers "Where he's seen" (sightings + seen-feedings) / "Where he's fed" (by spot); range 7 / 30 days / All, opening on 30. |

## Open items for Wallie

- **Map center** — set it once per machine (`source/README.md` → "Map center"); until then the app runs without maps. Hosting needs `King__Map__Center__Latitude/Longitude` (`infra/README.md`).
- **Known gaps, not fixed in 2b** — (1) the catalog test checks message *ids*, not text, so an edited `defaultMessage` without `bun run i18n` still passes (that's how the stale tagline slipped through 2a); (2) a failed log, sighting or "Save spot" request isn't shown to the person (pre-existing for logs; spots inherit it).
- **Broken `node_modules/.bin` (seen once)** — during Slice 3, `vitest`/`vite` vanished from `node_modules/.bin` while `aspire run` and the e2e AppHost were both up; both start a `bun install` (`webfrontend-installer`), and an earlier run logged `Failed to link @babel/parser: EEXIST`. Cause not confirmed. Fix: `cd source/frontend && bun install --frozen-lockfile`. Avoid running `dotnet test` while `aspire run` is up.
- **Same-name places far from spots** — two blocks can both read "About 1,100 ft from Porch"; adding a direction ("1,100 ft north of Porch") would tell them apart. Not built; Wallie to decide.
- **Commit author email** — `main` was pushed with `jamie@pithyplatypus.com`, so it's public in history; changing it now means rewriting history and force-pushing. For later commits only, set a noreply address (`git config user.email`) if wanted.

---

## Handoff prompt

Paste this to start the next session:

```text
Continue kingofwees.com. Read PLAN.md first (status key at the top), then CLAUDE.md, source/KingOfWees.Server/CLAUDE.md, source/frontend/CLAUDE.md and source/README.md. Slice 1, Phase 2a and 2b, and Slice 3 (history page: heat map + full log, plus "change" renaming the entry just logged) are built, committed and pushed on `main`. The contact email is set (kingcat.weesdistrict@gmail.com).

Next: finish Slice 3's phase-end StrykerJS run. Ask Wallie to stop `aspire run` first — running tests while it is up once broke node_modules/.bin (see "Open items for Wallie"). Run `cd source/frontend && bun run mutate` alone and let it finish (a full run, ~20–25 min: stopped runs leave no incremental file), triage the survivors (equivalent vs real gaps; close real gaps test-first), record the score under Slice 3 in PLAN.md, flip Slice 3 to ✅, and stop for Wallie's review. Then ask Wallie which "Later" item comes next (photos, "not fed in 12 hours" alerts, admin delete for spam, go-live hosting) and plan it in PLAN.md with Wallie before building.

Remember: "Seen means SawKing" (server CLAUDE.md); feedings store only a SpotId (their place is the spot's); every coordinate is already rounded; distances shown to people are feet/miles (frontend CLAUDE.md); query-string requests bind through an [AsParameters] record so they get validated.

Open items: the map center needs setting in the server's user-secrets (source/README.md). Other known gaps are under "Open items for Wallie" in PLAN.md.

Working method: test-first (red on an assertion → green → perturb the code to prove the test can fail → refactor); FluentValidation for every request type; minimal APIs only; semantic CSS classes, no inline styles; all text via react-intl, then `bun run i18n`. Each step lands warning-free: `(cd source && dotnet clean && dotnet build)`, `dotnet test`, `cd source/frontend && bun run lint && bun run test && bun run build`. Run StrykerJS alone at phase end (`bun run mutate`, incremental). Update PLAN.md status as each step starts and finishes, and refresh this handoff prompt at every stop. Wallie drives commits.
```
