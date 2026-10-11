# Health endpoints in production

**Decided:** 2026-10-09, Slice 5 step 4 (go-live).

## What happened

The Aspire template maps `/health` and `/alive` only in Development, with a note about the "security implications" of exposing them. Running the production image in step 1 and against DocumentDB in step 2 showed the consequence for this app: in production `/health` isn't an endpoint, so the SPA fallback answers it with `index.html` and a **200**. A Container Apps health probe would pass with the database down.

## The choice

Both are mapped in every environment (`MapDefaultEndpoints` in `Extensions.cs`):

- **`/health`** — every check, the database included → readiness probe. 503 when Mongo/DocumentDB can't be reached.
- **`/alive`** — only checks tagged `live` (the app itself) → liveness probe. It must not include the database: a restart can't fix the database, and restarting in a loop during a database outage only adds downtime.

The template's security concern is about detailed health output. The default writer returns only `Healthy` / `Unhealthy`, with no check names, exceptions or timings; keep it that way. Health requests are already left out of traces. A public `/health` costs one database ping per call; the probes call it every few seconds, which is nothing at this size.

## Photo storage is left out

Added 2026-10-11, Slice 6 step 1. Aspire's Blob client adds a health check to `/health` by default. `/health` is the readiness probe, so a Blob Storage outage would leave the app with no ready replica — status, history and posting gone because photos can't be stored. `Program.cs` turns that check off: a failed upload says so on the page and the entry stays.

## The database name

Found in step 2: DocumentDB's portal connection string doesn't name a database, and `AddMongoDBClient("king")` then registers no `IMongoDatabase` — the server starts and every request is a 500. `Program.cs` now refuses to start with a connection string that names no database, saying to put `/king` before the `?`, so the mistake shows at deploy.
