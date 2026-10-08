# King of Wees — Plan

**Status key:** ✅ done · 🔄 in progress · ⏳ pending · ⏸️ waiting on a decision

**Now:** Phase 2b done and committed on branch `phase-2b` (reviewed in Wallie's manual test; fixes folded in). Next: Slice 3 (heat map + history page). Last updated 2026-10-08. Last updated 2026-10-08.

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

## Slice 2 — Multi-select food, About/Privacy, location & map 🔄

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

## Later ⏳

- **Slice 3:** heat map + history page (data from 2b).
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
| 2026-10-08 | Name question appears when a never-asked device first taps "I fed" / "I saw", before logging. Skip (or an empty Save) is remembered as "no name" and shows "Logging as a neighbor · change". "change" renames *later* entries only — the entry just logged keeps its name (Undo and re-log to fix it). |

## Open items for Wallie

- **Contact email address** — Wallie will supply it later; until then the site shows `replace-me@example.invalid` (one constant in `source/frontend/src/site.ts`). Swap it in when provided — the page tests read the constant, so no test changes.
- **Map center** — set it once per machine (`source/README.md` → "Map center"); until then the app runs without maps. Hosting needs `King__Map__Center__Latitude/Longitude` (`infra/README.md`).
- **Known gaps, not fixed in 2b** — (1) the catalog test checks message *ids*, not text, so an edited `defaultMessage` without `bun run i18n` still passes (that's how the stale tagline slipped through 2a); (2) a failed log, sighting or "Save spot" request isn't shown to the person (pre-existing for logs; spots inherit it).
- **Commit author email** — commits use `jamie@pithyplatypus.com`; switch to a GitHub noreply address before the first push if it shouldn't be public.

---

## Handoff prompt

Paste this to start the next session:

```text
Continue kingofwees.com. Read PLAN.md first (status key at the top), then CLAUDE.md, source/KingOfWees.Server/CLAUDE.md, source/frontend/CLAUDE.md and source/README.md. Slice 1, Phase 2a and Phase 2b are done; 2b is committed on branch `phase-2b` (check whether Wallie has merged it into main).

Next: Slice 3 — heat map + history page from the 2b data (feeding spots, sighting locations). Plan it in PLAN.md with Wallie before building. Contrast with the home map, which shows only "Last fed & seen". Remember the "Seen means SawKing" rule (server CLAUDE.md) when querying sightings, and that every coordinate is already rounded.

Open items: the contact email is still a placeholder (replace-me@example.invalid in source/frontend/src/site.ts) — swap it in when Wallie gives it. The map center needs setting in the server's user-secrets (source/README.md). Known gaps are listed under "Open items for Wallie" in PLAN.md.

Working method: test-first (red on an assertion → green → perturb the code to prove the test can fail → refactor); FluentValidation for every request type; minimal APIs only; semantic CSS classes, no inline styles; all text via react-intl, then `bun run i18n`. Each step lands warning-free: `(cd source && dotnet clean && dotnet build)`, `dotnet test`, `cd source/frontend && bun run lint && bun run test && bun run build`. Run StrykerJS alone at phase end (`bun run mutate`, incremental). Update PLAN.md status as each step starts and finishes, and refresh this handoff prompt at every stop. Wallie drives commits.
```
