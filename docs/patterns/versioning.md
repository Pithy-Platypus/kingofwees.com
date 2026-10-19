# Versioning

One version for the whole site: **`<commit date, UTC, year.month.day>+<12-character commit>`**, e.g. `2026.10.18+f349dc1e5d2a`, with `.dirty` appended for a build made with uncommitted changes. `source/version.sh` is the only place it is worked out; everything else runs it:

| Where | How it gets the version |
|---|---|
| Server | `KingOfWees.Server.csproj` runs the script before `GetAssemblyVersion` and sets `InformationalVersion` (the SDK's own `+<full commit>` suffix is off). `AppVersion.Server` reads it back. |
| Frontend | `vite.config.ts` runs the script: `import.meta.env.VITE_APP_VERSION` in the bundle, and `version.json` in the build output (so in the image's `wwwroot`). |
| `GET /api/version` | `{ server: { version }, frontend: { version } }` — the server's own, and the one in `wwwroot/version.json` (`null` where there is none, as in development). |
| Telemetry | The OpenTelemetry resource attribute `service.version` (only that attribute is added; the service name stays what the environment sets, which the portal already shows). |
| About page | "This page: …" (the bundled version of the tab you're looking at) and "Server: …" (from `/api/version`). |
| Source link | `sourceUrl` in `src/site.ts`: the About and Privacy pages link to `github.com/Pithy-Platypus/kingofwees.com/tree/<commit>`, the commit taken from the bundled version (`.dirty` dropped), so a reader sees the exact code of the page in front of them, not whatever `main` holds now. |
| `infra/deploy.sh` | Refuses a commit that isn't on GitHub yet (the source link would be a 404), prints it, labels the image `org.opencontainers.image.version`, and after the smoke test fails unless the live `/api/version` reports it for both halves. |

## Why this shape (decided 2026-10-18 with Wallie)

- **Date plus commit, not semantic versioning.** SemVer tells consumers about compatibility; this site has none — one deployable, shipped whenever `deploy.sh` runs. The commit identifies the code exactly; the date makes it readable and roughly ordered (two commits on one day order by nothing but the commit).
- **Commit date, not build or deploy date.** Rebuilding the same commit gives the same version, so the version names the code. A redeploy of an unchanged commit (e.g. to pick up the month's DB-IP file) keeps its version.
- **UTC**, so the date doesn't depend on who built it or where.
- **No leading zeros** (`2026.1.8`, not `2026.01.08`): that keeps it a valid semantic version (SemVer forbids leading zeros in numbers) and a valid .NET `Version`, which would print `01` as `1` — two tools would show different strings for one build.
- **The image tag stays the bare commit**: `+` isn't allowed in a Docker tag. The version ends in that commit, so they still match; the image's version label carries the full string.
- **`/api/version`, not `/version` or Dockerflow's `/__version__`**: under `/api` it goes through the Vite proxy in development and the E2E run (a root path would get `index.html` from Vite), sits behind the read rate limit, and keeps the "unknown `/api` routes are 404" rule simple. There is no formal standard for this endpoint; the shape borrows Dockerflow's idea (a small JSON document at a stable path, naming the commit) with a section per half.
- **The page shows its own version, not only the server's.** Pages are `no-cache` but scripts are cached `immutable`, so a tab opened before a deploy keeps running the old script. Only the bundle knows which one that is; the server can report only the frontend it now serves.

## Rejected

- `package.json`'s `"version"`: npm needs valid SemVer there and only uses it to publish (the package is `private`); it stays `0.0.0`.
- Computing the version separately in MSBuild, in Vite and in `deploy.sh`: three formulas drift. Everything runs the script.
- Passing the version from `deploy.sh` into the builds: a local build would then have none; with the script, every build gets the same value (deploy refuses a dirty tree, so its builds never say `.dirty`).
