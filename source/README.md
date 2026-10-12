# source

The King of Wees app: an ASP.NET Core minimal API that also serves a React SPA, orchestrated locally by Aspire with MongoDB in a container.

## Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| .NET SDK | 10.0.4xx | |
| Aspire CLI | 13.6 | `aspire run` |
| Bun | 1.4 | Package manager only — Node runs Vite, Vitest and Stryker |
| Node | 22+ | |
| Docker | any recent | Mongo and Azurite (Azure Storage emulator, for photos) containers |

## Run

```sh
cd source
aspire run          # dashboard link prints in the terminal: server, webfrontend, mongo
```

Dev data persists in Docker volumes (Mongo and Azurite). Tests run the AppHost with `PersistData=false`, so they never touch it.

### Map center (once per machine)

The map opens on King's street, which stays out of this public repo. Set it in the server's user-secrets (any precision; it's rounded to ~a block):

```sh
cd source
dotnet user-secrets set "King:Map:Center:Latitude"  "<latitude>"  --project KingOfWees.Server
dotnet user-secrets set "King:Map:Center:Longitude" "<longitude>" --project KingOfWees.Server
```

Without it, `/api/king/map` answers 404 and the app works without maps.

### Admin key (optional)

Admin routes (`/api/admin/...`) exist only when a key hash is configured. Make a key and its hash with the server's own hasher, then store **only the hash**:

```sh
cd source
dotnet run tools/new-admin-key.cs                  # prints the key (keep it) and its hash
dotnet user-secrets set "King:Admin:KeyHash" "<hash>" --project KingOfWees.Server
```

Enter the key and your name at `/admin` (the browser keeps both on that device; **Sign out on this device** forgets them); the history page then shows hide buttons under each entry, and `/photos` under each photo; hiding a photo asks why (a reason from a short list, and a note — required for Other). `/admin` itself lists every place with its feedings, **Rename** and tick boxes to **Merge** duplicates, what's hidden — entries, photos (in words only, the picture is never shown again, each with when, by whom and why it was hidden) and posters — with **Show again** / **Show photo again** / **Restore**, and the **Activity** log — every sign-in, wrong key and change, with the typed name (a claim, not proof: the key is shared) and address, kept a year. The API takes the key as `Authorization: Bearer <key>` and the name as `X-Admin-Name` (URL-encoded). A hash that isn't 64 hex characters stops the server starting. Rotating at go-live: `infra/README.md`.

## Test

```sh
cd source
dotnet test                       # store contract (real Mongo), API, validators, Playwright e2e
KING_TEST_MONGO="<connection string>" dotnet test --project tests/KingOfWees.Server.Tests -- --filter-class "KingOfWees.Server.Tests.King.Mongo*"
                                  # the Mongo store contracts against another server (e.g. DocumentDB); test databases are dropped afterwards
cd frontend
bun run lint                      # zero warnings allowed
bun run test                      # Vitest
bun run mutate                    # StrykerJS on the logic files → reports/mutation/mutation.html (run alone; incremental — after a change only the changed files' mutants rerun, minutes; a full run ~3 h)
```

The first e2e run downloads Chromium via Playwright's own installer (no PowerShell needed).

## Projects

| Path | What it is |
|---|---|
| `KingOfWees.AppHost/` | Aspire orchestration: Mongo (+ `king` database), Azurite (+ `photos` blob container), server, Vite frontend (`WithBun`) |
| `KingOfWees.Server/` | Minimal API. `SpaFiles.cs` serves the built SPA: `/assets/` pre-compressed (brotli/gzip from the build) and cached `immutable`, pages `no-cache`, deep links to `index.html`. `SecurityHeaders.cs` adds the Content-Security-Policy, HSTS, `nosniff` and `Referrer-Policy` to every response. `King/` holds the domain, Mongo stores (`events`, `spots`, `hiddenReporters`), endpoints, validators, metrics, `GeoPoint` (rounds coordinates); `Admin/` the admin key (hasher, options, authentication handler), the `/api/admin` endpoints (hide, describe, list, restore, rename and merge places, activity) and the audit log (`AdminAudit`, Mongo `adminLog` with a 1-year TTL index the app creates on its first record); `Photos/` photo records (Mongo `photos`, hidden like entries), photo files (`IPhotoBlobStore`, Blob Storage) and `JpegMetadata` (strips EXIF/XMP and other metadata segments without decoding); `Validation/` the FluentValidation endpoint filter |
| `tools/` | Command-line helpers (`new-admin-key.cs`: a new admin key and its hash) — see `tools/README.md` |
| `frontend/` | React + Vite + TypeScript, Tailwind v4 + daisyUI 5 custom `king` theme; `build/precompress.ts` writes a brotli and a gzip copy of each built script and stylesheet |
| `tests/KingOfWees.Server.Tests/` | Store contract tests for events, spots, hidden devices and the audit log (Mongo and in-memory doubles; the log's expiry index on Mongo only), photo records and the photo file store (Mongo, Azurite and in-memory doubles), JPEG metadata stripping (synthetic segments and a real JPEG in `TestData/`), API tests (`WebApplicationFactory`), validator and `GeoPoint` unit tests |
| `tests/KingOfWees.E2E/` | Playwright + axe (WCAG 2.2 AA) against the full AppHost. `AppFixture` sets a test map center, a test admin key's hash, high rate limits and MaxMind's test country database (with forwarded addresses trusted, so a page can pose as a GB visitor); `KingFlowTests` (admin flows in `KingFlowTests.Admin.cs`, photo flows in `KingFlowTests.Photos.cs`) is one class so its flows share the database one at a time |

## API

| Method | Route | Notes |
|---|---|---|
| GET | `/api/king/status` | `lastFed`, `lastSeen`, `recent` (10, newest first). `lastSeen` is the newest sighting **or** feeding with `sawKing` — it can be the same event as `lastFed`. Every event carries `spotName` and `location`: a feeding's come from its spot, a sighting's from where it was logged; and `photoId` (its photo while visible, else `null`). `latestPhoto`: the newest visible photo of any kind (same shape as on `/api/king/photos`), for Home's avatar, or `null` |
| GET | `/api/king/history?before=&limit=` | `{ events, next }` — every event newest first (same shape as `recent`), `limit` 1–100 (default 50). `next` is the id to pass as `before` for the older page; `null` on the last page. An unknown `before` is a 400 (`before.unknown`) |
| GET | `/api/king/heat?layer=&days=` | `{ cells: [{ location, count, spotName }] }`, most first. `layer=seen`: one cell per block — sightings with a place plus feedings where King was seen, at their spot (the page then folds blocks near a spot into one place). `layer=fed`: one cell per spot (with its name), every feeding. `days` is 7 or 30, omitted = all time. Entries without a place aren't counted. Codes `layer.invalid`, `days.invalid` |
| POST | `/api/king/feedings` | `{ reporterKey, reporterName?, foods?: ("wet" \| "dry" \| "treats")[], sawKing?, spotId? }` — any food combination, no duplicates; `sawKing` defaults to `true` (false = "I left food out"); `spotId` must name an existing spot |
| POST | `/api/king/sightings` | `{ reporterKey, reporterName?, location?: { latitude, longitude } }` — location rounded to 3 decimals; a half-given location is a 400 |
| GET | `/api/king/spots` | Feeding spots `{ id, name, location }`, oldest first (the client sorts by name) |
| GET | `/api/king/photos?before=&limit=` | `{ photos: [{ id, postedAt, reporterName, event }], next }` — every visible photo newest first; `event` is its entry as in history (with `photoId`), `null` for a shared photo. Paged like history (`limit` 1–100, default 50; `limit.outOfRange`, `before.unknown`) |
| GET | `/api/king/photos/{id}/full`, `/thumb` | The JPEG (`Cache-Control: private, max-age=3600`, `nosniff`); 404 for an unknown photo or one hidden in any way (itself, its entry, its device) |
| GET | `/api/king/map` | `{ center: { latitude, longitude } }` from `King:Map:Center`; 404 when not configured |
| GET | `/api/king/posting` | `{ allowed }` — false only for an address known to be outside the US, when `King:Posting:CountryDatabase` is set; Home then shows a message instead of the two buttons |
| POST | `/api/king/spots` | `{ reporterKey, name, location: { latitude, longitude } }` — anyone can add; name ≤ 40, trimmed; location rounded to 3 decimals |
| DELETE | `/api/king/events/{id}` | `X-Reporter-Key` header; same device, within 10 minutes; takes the entry's photo with it |
| POST | `/api/king/events/{id}/photo` | Multipart `photo` (JPEG ≤ 1 MB) and `thumbnail` (JPEG ≤ 100 KB); `X-Reporter-Key` header, same device and 10-minute window as DELETE (404 / 409 `undo.expired`). Sightings and feedings where King was seen only (400 `photo.leftOut`); one per entry (409 `photo.exists`). Stored without metadata (EXIF, XMP…). Codes `photo.required`, `photo.tooLarge`, `photo.notJpeg` (same for `thumbnail`); a body over 1.16 MB is a 413. 201 `{ id, postedAt, reporterName, event }` |
| POST | `/api/king/photos` | A shared photo, on no entry (never a sighting): multipart `reporterKey`, `reporterName?`, `photo`, `thumbnail` as above. 201 with `event: null` |
| DELETE | `/api/king/photos/{id}` | `X-Reporter-Key` header; one's own photo, within 10 minutes of posting; its files go too |
| PATCH | `/api/king/events/{id}` | `{ reporterName }` (null = no name) — renames an entry; same device and 10-minute window as DELETE (404 / 409 `undo.expired`) |
| GET | `/api/admin/check` | 204 with the right `Authorization: Bearer <admin key>`, else 401. Every `/api/admin` route: 404 when no key hash is configured; requests with the right key are never limited; no key or a wrong one: per-IP limit `RateLimiting:AdminPerMinute` (default 10) |
| POST / DELETE | `/api/admin/events/{id}/hide` | Hide one entry from every public read / show it again. 204; unknown id 404 |
| GET | `/api/admin/events/{id}/device` | What hiding that entry's device would hide: `{ entries, spots, reporterName, newestAt }` (name on its newest entry; hidden ones counted too) |
| POST | `/api/admin/events/{id}/hide-device` | Hide every entry and spot from that entry's device, including later posts. Hiding again keeps the first record. Returns the hidden-device view below |
| GET | `/api/admin/hidden-entries` | Entries hidden one by one, newest first, same shape as history events |
| GET | `/api/admin/hidden` | Hidden devices, newest hidden first: `[{ id, hiddenAt, entries, spots, reporterName, newestAt }]` — `id` is the record's own, never the device key |
| DELETE | `/api/admin/hidden/{id}` | Restore a device: everything comes back, including posts made while hidden. 204; unknown id 404 |
| GET | `/api/admin/spots` | Every place, hidden posters' too, oldest first: `[{ id, name, hiddenPoster, feedings }]` — `feedings` counts every feeding there, hidden ones included (all of them move in a merge). Never the device key |
| POST | `/api/admin/spots/rename` | `{ spotId, name }` — rename a place; feedings hold only its id, so the new name shows everywhere at once. Name trimmed, 1–40 characters (`name.required`, `name.tooLong`), not another place's name ignoring case, hidden posters' places included (`name.taken`; its own name in other capitals is fine); unknown place `spotId.unknown`. 204 |
| POST | `/api/admin/spots/merge` | `{ keepId, mergeIds, name? }` — every feeding at the `mergeIds` places (hidden ones too) moves to `keepId`, whose pin stays; the merged places are **deleted, no undo**. `name` renames the kept place: trimmed, 1–40 (`name.required`, `name.tooLong`), not another place's name ignoring case — the merged places' own names don't count (`name.taken`). `keepId.unknown`; `mergeIds.required` (none), `mergeIds.invalid` (repeats or the kept id), `mergeIds.unknown`. Recorded in the activity log. 204 |
| POST / DELETE | `/api/admin/photos/{id}/hide` | Hide one photo from everyone (its entry stays) / show it again. POST takes `{ reason, note }`: `notKing`, `showsPerson`, `rude`, `unlawful` or `other`, the note ≤ 200 characters and required for `other` (400 `reason.required` / `reason.unknown` / `note.required` / `note.tooLong`); stored with the time and the typed name, cleared on show. Never deleted: the files stay. 204; unknown id 404; recorded as `hidePhoto` (with reason and note) / `showPhoto` |
| GET | `/api/admin/hidden-photos` | Photos hidden one by one, newest first, shaped like `/api/king/photos` (each with its entry, or `null`) plus `hidden: { reason, note, at, by }` (`null` for photos hidden before reasons existed). The page lists them in words only |
| GET | `/api/admin/activity?before=&limit=` | The audit log, newest first: `{ records: [{ id, at, action, adminName, address, touched }], next }` — paged like history (`limit` 1–100, default 50; `before.unknown`, `limit.outOfRange`). `action`: `signIn` (a good `/check`), `signInFailed` (a wrong key on any admin route; no key isn't recorded), `hideEntry`, `showEntry`, `hidePoster`, `restorePoster`, `renamePlace`, `mergePlaces`, `hidePhoto`, `showPhoto`. `touched` says what in words — `posterName`, `entries`, `spots`, `entryKind` (for a photo: its entry's kind, `null` for a shared photo), `entryAt`, `placeName`, `newName`, `mergedNames`, `feedings` — never a device key. `adminName` is the `X-Admin-Name` header sent with the key (URL-encoded, trimmed, cut to 40; `null` = no name). `address` is the one the rate limits use. Append-only; the database deletes records after a year |

`GET /health` (every check, the database included; `Healthy` 200 / `Unhealthy` 503) and `GET /alive` (the app only) exist in every environment — the readiness and liveness probes. The server won't start if `ConnectionStrings:king` names no database (`…/king?…`).

Any other path serves the SPA (`index.html`) so links like `/about` work; unknown `/api/...` routes stay 404.

Entries an admin has hidden, and everything from a device an admin has hidden (including its later posts and its spots), are left out of every public read: status, history, heat and spots. A feeding at a hidden device's spot stays, without a place.

Writes go through the `CanPost` policy (open today; the switch for invite-only posting) and a per-IP rate limit (`RateLimiting:WritesPerMinute`, default 20). Every other `/api/king` route has a per-IP read limit (`RateLimiting:ReadsPerMinute`, default 120), except the photo files, which have their own (`RateLimiting:PhotoFilesPerMinute`, default 600); over a limit is a 429. Request bodies are capped at 64 KB, except photo uploads (413 beyond). With `King:Posting:CountryDatabase` set to an MMDB country file (the image ships DB-IP Country Lite), every write from an address known to be outside the US is a 403 with code `posting.outsideUs`; unknown addresses are allowed; a path that can't be read stops the server starting. Unset (local dev, tests): no check. Behind Container Apps' ingress, set `King:Proxy:TrustForwardedFor=true` so the limits see each visitor's address (the rightmost `X-Forwarded-For` entry) instead of the proxy's; leave it off anywhere the server is reachable directly. Validation errors return codes such as `reporterName.tooLong`, which the frontend translates.

## Frontend layout

| Path | What it is |
|---|---|
| `src/App.tsx` | Routes (`/`, `/history`, `/photos`, `/about`, `/privacy`, `/admin` — not linked anywhere), the admin key on this device, page titles, screen state (home → feed → logged), loading and error states, footer |
| `src/routing/` | History-API router (`useRoute`, `navigate` — each in-app navigation starts the new page at its top) and `Link` — no router library |
| `src/pages/` | History (`HeatMapSection` + `HistoryLog`, paged by day; with an admin key each entry gets `AdminEntryActions`: hide it, its photo, or everything from its poster, asked in place), Photos (`PhotosPage`, loaded on demand: every visible photo newest first, 50 at a time, "Share a photo", and "Hide this photo" with an admin key; tells the app to reload Home's status after a share or hide), `HidePhotoForm.tsx` ("Hide this photo" asked in place with a reason and a note, under a History entry and on `/photos`), `adminMessages.ts` (admin phrases and reason labels the pages share), Admin (`AdminPage`, loaded on demand so visitors never download it: key and name form, places with rename and merge, hidden entries, photos (with their reasons) and posters, restore, the activity log paged with Show older, sign out), About and Privacy pages (`PageShell` gives the back link and focused heading) |
| `src/site.ts` | Contact email shown on the pages |
| `src/king/` | `LazyMapView.tsx` (the only way in to `MapView`: Leaflet loads when a map first shows; lint-enforced), screens (home, name question, feed — foods and spot tiles, add a spot, "Where is King?", logged), `useSpotsByName.ts` (spots sorted for the reader's language), `ActivityItem.tsx` (one activity line, shared by Lately and the history log; an entry's photo as a thumbnail linking to the full size), API client (rounds every location it sends), `admin.ts` (admin API calls with the key as a `Bearer` header and the typed name beside it, both kept on this device, spotting a pasted hash), `photo.ts` (shrinks a picked photo to the two JPEGs the server takes) and `PhotoSlot.tsx` ("Add a photo", the picked photo, and its upload on the confirmation with Retry), per-device storage (`reporter.ts`: undo key, nickname, last spot), `location.ts` (rounding, geolocation, nearest and closest spot), `heat.ts` (heat levels, folding blocks near a spot into one place, naming places after the spots, feet/miles), `MapView.tsx` (the only Leaflet code; heat circles too; the home map is zoom-only — no dragging, zoom about its center; picking maps keep a pin at the center and report the point under it whenever the map stops moving), time/mood logic, shared messages (incl. photo alt texts: how a photo was added, like its history line) |
| `src/i18n/` | Locale resolution, `LocaleProvider` (sets `<html lang dir>`; waits for a non-default catalog), compiled catalogs — loaded on demand (`loadCatalog`), so the `en-XA` test catalog isn't in every visitor's download |
| `lang/en-US.json` | Extracted source messages with translator descriptions — the file translators receive |

### Adding or changing text

1. Write the message with `defineMessages` beside the component (`id`, `defaultMessage`, `description`). Messages with placeholders declare their value types.
2. Run `bun run i18n` to re-extract `lang/en-US.json` and recompile the `en-XA` pseudo-locale.
3. Check it at `/?locale=en-XA`. The catalog test fails if step 2 was skipped.

## Packages

- .NET versions live only in `Directory.Packages.props` (Central Package Management); shared build settings in `Directory.Build.props` (warnings are errors).
- **Leaflet** (+ `@types/leaflet`) is the one map dependency, used directly in `MapView.tsx` — no `react-leaflet`. Markers are SVG circle markers, so no marker images need bundling. Tiles come from `tile.openstreetmap.org` (disclosed on the Privacy page); e2e tests stub them.
- Bun installs exact versions, refuses releases newer than 7 days (`bunfig.toml`) and runs no dependency install scripts (`"trustedDependencies": []`).
