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

## Test

```sh
cd source
dotnet test                       # store contract (real Mongo), API, validators, Playwright e2e
cd frontend
bun run lint                      # zero warnings allowed
bun run test                      # Vitest
bun run mutate                    # StrykerJS mutation report → reports/mutation/mutation.html (run alone; incremental — reuses results for unchanged code)
```

The first e2e run downloads Chromium via Playwright's own installer (no PowerShell needed).

## Projects

| Path | What it is |
|---|---|
| `KingOfWees.AppHost/` | Aspire orchestration: Mongo (+ `king` database), server, Vite frontend (`WithBun`) |
| `KingOfWees.Server/` | Minimal API. `King/` holds the domain, Mongo store, endpoints, validators, metrics; `Validation/` the FluentValidation endpoint filter |
| `frontend/` | React + Vite + TypeScript, Tailwind v4 + daisyUI 5 custom `king` theme |
| `tests/KingOfWees.Server.Tests/` | Store contract tests (Mongo and in-memory double), API tests (`WebApplicationFactory`), validator unit tests |
| `tests/KingOfWees.E2E/` | Playwright + axe (WCAG 2.2 AA) against the full AppHost |

## API

| Method | Route | Notes |
|---|---|---|
| GET | `/api/king/status` | `lastFed`, `lastSeen`, `recent` (10, newest first) |
| POST | `/api/king/feedings` | `{ reporterKey, reporterName?, foods?: ("wet" \| "dry" \| "treats")[] }` — any combination, no duplicates |
| POST | `/api/king/sightings` | `{ reporterKey, reporterName? }` |
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
| `src/king/` | Screens, API client, per-device reporter key, time/mood logic, shared messages |
| `src/i18n/` | Locale resolution, `LocaleProvider` (sets `<html lang dir>`), compiled catalogs |
| `lang/en-US.json` | Extracted source messages with translator descriptions — the file translators receive |

### Adding or changing text

1. Write the message with `defineMessages` beside the component (`id`, `defaultMessage`, `description`). Messages with placeholders declare their value types.
2. Run `bun run i18n` to re-extract `lang/en-US.json` and recompile the `en-XA` pseudo-locale.
3. Check it at `/?locale=en-XA`. The catalog test fails if step 2 was skipped.

## Packages

- .NET versions live only in `Directory.Packages.props` (Central Package Management); shared build settings in `Directory.Build.props` (warnings are errors).
- Bun installs exact versions, refuses releases newer than 7 days (`bunfig.toml`) and runs no dependency install scripts (`"trustedDependencies": []`).
