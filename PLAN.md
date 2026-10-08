# King of Wees — Plan

**Status key:** ✅ done · 🔄 in progress · ⏳ pending · ⏸️ waiting on a decision

**Now:** Phase 2a done and committed (`d3b29cb`). Next: Phase 2b step 1 (optional nickname + "fed means seen"). Last updated 2026-10-08.

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

### Phase 2b — who fed, location, feeding spots, map ⏳

| # | Step | Status |
|---|---|---|
| 1 | **Optional nickname ("who fed / who saw")**: asked once per device on the first log ("What should neighbors call you? A first name or nickname" + big Skip), remembered in the browser, sent as `reporterName` (server already validates ≤ 40); "Logging as Sarah · change" on the confirmation screen; Lately shows "Fed by Sarah". **Privacy page must change** ("We don't ask for your name" → names are optional, shown publicly, use a first name or nickname; parents: suggest a nickname for kids). Tests incl. Skip path, change path, privacy promise, axe. **Fed means seen (option C):** a feeding counts as a sighting unless the feeder ticks "I left food out (didn't see him)" (off by default) — new `sawKing` flag on feedings (missing → true for old data). Status `lastSeen` = newest sighting **or** seen-feeding. Home chips: if the latest sighting *is* the feeding → one chip "Fed & seen {when}"; if a sighting is newer → "Fed {when}" · "Seen {when}"; left-food-out feedings never move "Seen". Tests: store contract, API status rules, chip rules, toggle default, perturbation. | ⏳ |
| 2 | Location privacy rule: round to 3 decimals (~a block) on client **and** server before storing; rule in `CLAUDE.md` files, why in `docs/patterns/location-privacy.md` | ⏳ |
| 3 | Feeding spots: `spots` collection, `GET/POST /api/king/spots`, anyone can add while logging; feeding `spotId` validated with `MustAsync` | ⏳ |
| 4 | Sightings: optional rounded `location`; status returns it and the feeding's spot name | ⏳ |
| 5 | Map config `GET /api/king/map` from `King:Map:Center` (user-secrets/env, **not** in the public repo) | ⏳ |
| 6 | UI: Fed → foods → spot (last used preselected) or "Somewhere new"; Seen → "I'm near him now" / tap map / Skip; home mini-map; keyboard "Use map center" | ⏳ |
| 7 | Privacy page: map tiles load from OpenStreetMap (they see your IP) | ⏳ |
| 8 | Tests: rounding, validators, spot store contract, API, Vitest with fake geolocation, Playwright geolocation + axe | ⏳ |

New dependency: **Leaflet** (+ `@types/leaflet`), used directly — no `react-leaflet`.

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

## Open items for Wallie

- **Contact email address** — Wallie will supply it later; until then the site shows `replace-me@example.invalid` (one constant in `source/frontend/src/site.ts`). Swap it in when provided — the page tests read the constant, so no test changes.
- **Commit author email** — commits use `jamie@pithyplatypus.com`; switch to a GitHub noreply address before the first push if it shouldn't be public.

---

## Handoff prompt

Paste this to start the next session:

```text
Continue kingofwees.com. Read PLAN.md first (status key at the top), then CLAUDE.md, source/KingOfWees.Server/CLAUDE.md and source/README.md. Slice 1 and Phase 2a are done and committed.

Next: Slice 2, Phase 2b, starting with step 1 — the optional nickname ("who fed / who saw"). Ask once per device on the first log ("What should neighbors call you? A first name or nickname" with a big Skip), remember it in the browser, send it as reporterName (the server already validates ≤ 40 chars), show "Logging as {name} · change" on the confirmation screen, and update the Privacy page: it currently promises "We don't ask for your name" — replace that with: names are optional and shown publicly, use a first name or nickname, and a parents' note suggesting nicknames for kids. Cover the Skip path, the change path, the privacy promise and axe. Also in step 1, "fed means seen" (option C): a feeding counts as a sighting unless the feeder ticks "I left food out (didn't see him)" (off by default) — add a sawKing flag to feedings (missing → true for old documents); status lastSeen = newest sighting or seen-feeding; home shows one "Fed & seen {when}" chip when the latest sighting is that feeding, otherwise "Fed {when}" · "Seen {when}"; left-food-out feedings never move "Seen". See PLAN.md step 1 for the test list.

Then steps 2–8 in order: the location privacy rule (round coordinates to 3 decimals on the client before sending AND on the server before storing; rule in source/KingOfWees.Server/CLAUDE.md and a new source/frontend/CLAUDE.md, the why in docs/patterns/location-privacy.md), feeding spots (anyone adds while logging; spotId validated with MustAsync), sighting location, map config from King:Map:Center via user-secrets — never in the public repo, Leaflet UI flows, the Privacy page OpenStreetMap tile disclosure, and tests. Leaflet (+ @types/leaflet) is the one approved new dependency; use it directly, no react-leaflet. Stop for review after 2b.

The contact email is still a placeholder (replace-me@example.invalid in source/frontend/src/site.ts); Wallie will supply it later — swap it in when given.

Working method: test-first (red on an assertion → green → perturb the code to prove the test can fail → refactor); FluentValidation for every request type; minimal APIs only; semantic CSS classes, no inline styles; all text via react-intl, then `bun run i18n`. Each step lands warning-free: `(cd source && dotnet clean && dotnet build)`, `dotnet test`, `cd source/frontend && bun run lint && bun run test && bun run build`. Run StrykerJS alone at phase end (`bun run mutate`, incremental; the last full run took ~20 min). Update PLAN.md status as each step starts and finishes, and refresh this handoff prompt at every stop. Wallie drives commits.
```
