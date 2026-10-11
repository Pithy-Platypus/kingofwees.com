# infra

Nothing deployed yet. Chosen (2026-10-09): Azure Container Apps with the Azure DocumentDB free tier, Cloudflare DNS only — the steps are Slice 5 in `PLAN.md`; this page is rewritten for it at go-live. The table below is the original comparison.

| Option | Shape | Monthly cost (est.) |
|---|---|---|
| A. Managed free tiers | Azure Container Apps (scale to zero) + Azure DocumentDB free tier (Mongo API) + Blob + Grafana Cloud free (OTLP) | ≈ $0, cold starts |
| C. One small VM | `aspire publish` → Docker Compose: app, Mongo, Caddy (TLS), telemetry viewer, nightly off-box backup | ≈ $5–15, always warm |

Option B (every container on Container Apps, billed per second) was ruled out: always-on databases and telemetry make it the most expensive choice.

## Scripts (run from Wallie's Mac)

| Script | Does |
|---|---|
| `azure/provision.sh [image]` | Into resource group `kingofwees.com` (subscription "Playground", East US): Container Apps environment `kingofwees-env` (no Log Analytics workspace), container app `kingofwees` (one replica, 0.25 vCPU / 0.5 GiB, external HTTPS ingress, probes, settings as secrets), storage account `kingofweesbackups` with a private `backups` container (blobs deleted after 30 days, no shared keys), budget `kingofwees-monthly` ($25; email to the signed-in account at 80% actual and 100% forecast), and the DocumentDB firewall rule "Allow Azure services" — the app's outbound addresses are a shared pool of hundreds, so they can't be listed one by one; connections still need the cluster's credentials over TLS. Safe to rerun: re-applies the app's settings and restarts it. Refuses an image GHCR won't serve anonymously. |
| `deploy.sh` | Refuses a dirty tree; builds the image tagged with the commit; pushes it to GHCR; rolls the app onto it, waits until the new revision is ready, then runs `smoke.sh`. |
| `smoke.sh https://host` | `/health` answers `Healthy`, `/api/king/status` 200, `/api/admin/check` 401 without a key — over HTTPS with a valid certificate. |

Settings come from files in `~/.kingofwees/` (outside the repo, `chmod 600`), read by `provision.sh`, never printed: `documentdb.conn` (required, with `/king`), `admin-key.hash` (optional), `map-center` as `latitude,longitude` (optional). Change one, rerun `provision.sh`.

First deploy: `deploy.sh` (pushes; no app yet) → make the package public → `azure/provision.sh ghcr.io/pithy-platypus/kingofwees:<tag>` → `smoke.sh`. After that, `deploy.sh` alone.

## Check before the first deploy

- **Image.** Not built by `aspire publish`/`aspire deploy` (their Container Apps deploy adds a paid Azure Container Registry and a Log Analytics workspace): the deploy script builds the SPA with `bun run build`, the server with `dotnet publish /t:PublishContainer` for `linux-x64`, and layers the SPA into `/app/wwwroot` — measured this way in Slice 5 step 1.
- **GitHub Container Registry (GHCR), once.** The image is `ghcr.io/pithy-platypus/kingofwees` (`Pithy-Platypus` is an organization).
  1. Organization settings → Packages → Package creation: **Public** allowed (an owner does this).
  2. github.com/settings/tokens → **Generate new token (classic)** with `write:packages` only (fine-grained tokens can't push to GHCR); if the organization uses SSO, authorize the token for it. An expired token only stops deploys.
  3. In your own terminal: `docker login ghcr.io -u <github-username>` and paste the token at the prompt (Docker Desktop keeps it in the macOS Keychain).
  4. After the first push: the package → Package settings → **Change visibility → Public** (GHCR creates every package private; no API changes it). Public is safe: the image holds no secrets. The image's `org.opencontainers.image.source` label should connect it to `kingofwees.com`; if the package page doesn't show the repository, **Connect repository** there.
- **Region.** East US, resource group `kingofwees.com` — where the DocumentDB cluster is; the app goes beside it.
- **Database connection string.** The DocumentDB portal string with `/king` added before the `?` — the server refuses to start without a database name.
- **Probes.** Readiness `GET /health` (checks the database), liveness `GET /alive` (the app only), port 8080.
- **Visitor address.** Set `King__Proxy__TrustForwardedFor=true` on the container app — without it every visitor shares one rate limit. Never set it where the server is reachable without the ingress in front.
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
