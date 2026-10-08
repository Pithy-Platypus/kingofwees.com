# source

The King of Wees app: an ASP.NET Core minimal API that also serves a React SPA, orchestrated locally by Aspire with MongoDB in a container.

## Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| .NET SDK | 10.0.4xx | |
| Aspire CLI | 13.6 | `aspire run` |
| Bun | 1.4 | Package manager only — Node runs Vite, Vitest and Stryker |
| Node | 22+ | |
| Docker | any recent | Mongo container |

## Run

```sh
cd source
aspire run          # dashboard link prints in the terminal: server, webfrontend, mongo
```

Dev data persists in a Docker volume. Tests run the AppHost with `PersistData=false`, so they never touch it.

### Map center (once per machine)

The map opens on King's street, which stays out of this public repo. Set it in the server's user-secrets (any precision; it's rounded to ~a block):

```sh
cd source
dotnet user-secrets set "King:Map:Center:Latitude"  "<latitude>"  --project KingOfWees.Server
dotnet user-secrets set "King:Map:Center:Longitude" "<longitude>" --project KingOfWees.Server
```

Without it, `/api/king/map` answers 404 and the app works without maps.

## Test

```sh
cd source
dotnet test                       # store contract (real Mongo), API, validators, Playwright e2e
cd frontend
bun run lint                      # zero warnings allowed
bun run test                      # Vitest
bun run mutate                    # StrykerJS on the logic files → reports/mutation/mutation.html (~10 min; run alone; incremental — reuses results for unchanged code)
```

The first e2e run downloads Chromium via Playwright's own installer (no PowerShell needed).

## Projects

| Path | What it is |
|---|---|
| `KingOfWees.AppHost/` | Aspire orchestration: Mongo (+ `king` database), server, Vite frontend (`WithBun`) |
| `KingOfWees.Server/` | Minimal API. `King/` holds the domain, Mongo stores (`events`, `spots`), endpoints, validators, metrics, `GeoPoint` (rounds coordinates); `Validation/` the FluentValidation endpoint filter |
| `frontend/` | React + Vite + TypeScript, Tailwind v4 + daisyUI 5 custom `king` theme |
| `tests/KingOfWees.Server.Tests/` | Store contract tests for events and spots (Mongo and in-memory doubles), API tests (`WebApplicationFactory`), validator and `GeoPoint` unit tests |
| `tests/KingOfWees.E2E/` | Playwright + axe (WCAG 2.2 AA) against the full AppHost |

## API

| Method | Route | Notes |
|---|---|---|
| GET | `/api/king/status` | `lastFed`, `lastSeen`, `recent` (10, newest first). `lastSeen` is the newest sighting **or** feeding with `sawKing` — it can be the same event as `lastFed`. Every event carries `spotName` and `location`: a feeding's come from its spot, a sighting's from where it was logged |
| POST | `/api/king/feedings` | `{ reporterKey, reporterName?, foods?: ("wet" \| "dry" \| "treats")[], sawKing?, spotId? }` — any food combination, no duplicates; `sawKing` defaults to `true` (false = "I left food out"); `spotId` must name an existing spot |
| POST | `/api/king/sightings` | `{ reporterKey, reporterName?, location?: { latitude, longitude } }` — location rounded to 3 decimals; a half-given location is a 400 |
| GET | `/api/king/spots` | Feeding spots `{ id, name, location }`, oldest first (the client sorts by name) |
| GET | `/api/king/map` | `{ center: { latitude, longitude } }` from `King:Map:Center`; 404 when not configured |
| POST | `/api/king/spots` | `{ reporterKey, name, location: { latitude, longitude } }` — anyone can add; name ≤ 40, trimmed; location rounded to 3 decimals |
| DELETE | `/api/king/events/{id}` | `X-Reporter-Key` header; same device, within 10 minutes |

Any other path serves the SPA (`index.html`) so links like `/about` work; unknown `/api/...` routes stay 404.

Writes go through the `CanPost` policy (open today; the switch for invite-only posting) and a per-IP rate limit (`RateLimiting:WritesPerMinute`, default 20). Validation errors return codes such as `reporterName.tooLong`, which the frontend translates.

## Frontend layout

| Path | What it is |
|---|---|
| `src/App.tsx` | Routes (`/`, `/about`, `/privacy`), page titles, screen state (home → feed → logged), loading and error states, footer |
| `src/routing/` | History-API router (`useRoute`, `navigate`) and `Link` — no router library |
| `src/pages/` | About and Privacy pages (`PageShell` gives the back link and focused heading) |
| `src/site.ts` | Contact email shown on the pages |
| `src/king/` | Screens (home, name question, feed, spot picker, "Where is King?", logged), API client (rounds every location it sends), per-device storage (`reporter.ts`: undo key, nickname, last spot), `location.ts` (rounding, geolocation, nearest spot), `MapView.tsx` (the only Leaflet code), time/mood logic, shared messages |
| `src/i18n/` | Locale resolution, `LocaleProvider` (sets `<html lang dir>`), compiled catalogs |
| `lang/en-US.json` | Extracted source messages with translator descriptions — the file translators receive |

### Adding or changing text

1. Write the message with `defineMessages` beside the component (`id`, `defaultMessage`, `description`). Messages with placeholders declare their value types.
2. Run `bun run i18n` to re-extract `lang/en-US.json` and recompile the `en-XA` pseudo-locale.
3. Check it at `/?locale=en-XA`. The catalog test fails if step 2 was skipped.

## Packages

- .NET versions live only in `Directory.Packages.props` (Central Package Management); shared build settings in `Directory.Build.props` (warnings are errors).
- **Leaflet** (+ `@types/leaflet`) is the one map dependency, used directly in `MapView.tsx` — no `react-leaflet`. Markers are SVG circle markers, so no marker images need bundling. Tiles come from `tile.openstreetmap.org` (disclosed on the Privacy page); e2e tests stub them.
- Bun installs exact versions, refuses releases newer than 7 days (`bunfig.toml`) and runs no dependency install scripts (`"trustedDependencies": []`).
