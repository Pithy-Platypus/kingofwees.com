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
