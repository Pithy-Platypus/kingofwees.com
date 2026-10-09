# infra

Nothing deployed yet. The hosting choice is deferred until the app is ready to go live.

| Option | Shape | Monthly cost (est.) |
|---|---|---|
| A. Managed free tiers | Azure Container Apps (scale to zero) + Azure DocumentDB free tier (Mongo API) + Blob + Grafana Cloud free (OTLP) | ≈ $0, cold starts |
| C. One small VM | `aspire publish` → Docker Compose: app, Mongo, Caddy (TLS), telemetry viewer, nightly off-box backup | ≈ $5–15, always warm |

Option B (every container on Container Apps, billed per second) was ruled out: always-on databases and telemetry make it the most expensive choice.

## Check before the first deploy

- **Frontend build image.** `WithBun()` builds the SPA in an `oven/bun` image during publish; confirm Vite builds there (that image may lack Node), or pin an image with both.
- **Free-tier terms.** Re-verify the Container Apps grant, DocumentDB free tier (regions, inactivity pause, no backups) and Grafana Cloud limits.
- **Map center.** Set `King__Map__Center__Latitude` and `King__Map__Center__Longitude` as environment variables (or the host's secret store) on the server. Without them the app runs with no map.
- **Uptime pings.** Don't add an external pinger under option A: it keeps the app awake and exhausts the free grant.
- **Admin key.** Set `King__Admin__KeyHash` in the host's secret store, never in the repo — the hash only, from `dotnet run source/tools/new-admin-key.cs`. Without it the app runs with no admin routes. Serve over HTTPS only (both options give TLS): the key travels in a request header.

## Rotating the admin key (e.g. it leaked)

1. `dotnet run source/tools/new-admin-key.cs` — prints a new key and its hash. Put the key in your password manager.
2. Replace `King__Admin__KeyHash` with the new hash and restart the app:
   - **A (Container Apps):** update the secret, then restart the active revision — a secret change alone doesn't reach a running revision.
   - **C (one VM):** edit `.env`, then `docker compose up -d`.
3. The old key stops working as soon as the new hash is live; nothing else holds it.
4. On each device you moderate from, open `/admin` and enter the new key.

A value that isn't a 64-character hex hash (e.g. the key pasted by mistake) stops the server starting, so a bad paste shows at deploy.
