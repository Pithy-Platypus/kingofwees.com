# infra

Live on Azure Container Apps since 2026-10-11, at https://kingofwees.com and https://www.kingofwees.com (free managed certificates; the Container Apps address still answers too), with the Azure DocumentDB free tier; Cloudflare stays DNS only. The steps are Slice 5 in `PLAN.md`; this page gets its full rewrite in Slice 5 step 9. The table below is the original comparison.

| Option | Shape | Monthly cost (est.) |
|---|---|---|
| A. Managed free tiers | Azure Container Apps (scale to zero) + Azure DocumentDB free tier (Mongo API) + Blob + Grafana Cloud free (OTLP) | ≈ $0, cold starts |
| C. One small VM | `aspire publish` → Docker Compose: app, Mongo, Caddy (TLS), telemetry viewer, nightly off-box backup | ≈ $5–15, always warm |

Option B (every container on Container Apps, billed per second) was ruled out: always-on databases and telemetry make it the most expensive choice.

## Scripts (run from Wallie's Mac)

| Script | Does |
|---|---|
| `azure/provision.sh [image]` | Into resource group `kingofwees.com` (subscription "Playground", East US): Container Apps environment `kingofwees-env` (console logs not kept; its OpenTelemetry agent sends the app's traces and logs to Application Insights `kingofwees-insights`, stored in Log Analytics workspace `kingofwees-logs` — 31 days, capped at 0.05 GB a day), container app `kingofwees` (one replica, 0.25 vCPU / 0.5 GiB, external HTTPS ingress, probes, settings as secrets), storage account `kingofweesbackups` with a private `backups` container (blobs deleted after 30 days, no shared keys), backup job `kingofwees-backup` (nightly at 08:00 UTC: `azure/backup.sh` in the stock `mongo:8.0` image, pinned by digest; writes `king-<time>.archive.gz` and mongodump's `.log` with its own managed identity, allowed to write only to `backups`; the signed-in account may read it, for the drill), budget `kingofwees-monthly` ($25; email to the signed-in account at 80% actual and 100% forecast), alert `kingofwees-backup-failed` (emails the signed-in account through action group `kingofwees-alerts` when a backup run fails), and the DocumentDB firewall rule "Allow Azure services" — the app's outbound addresses are a shared pool of hundreds, so they can't be listed one by one; connections still need the cluster's credentials over TLS. Custom domains `kingofwees.com` and `www.kingofwees.com` with free managed certificates, each bound once its Cloudflare records resolve (DNS only, grey cloud — the certificate is issued and renewed only while DigiCert reaches the app directly): A `@` → the environment's static IP, CNAME `www` → the app's Container Apps address, TXT `asuid` and `asuid.www` → the app's domain verification ID (`az containerapp show … --query properties.customDomainVerificationId`); no CAA record, or one that allows `digicert.com`. Safe to rerun: re-applies the app's settings (keeping its bound domains) and restarts it. Refuses an image GHCR won't serve anonymously. |
| `deploy.sh` | Refuses a dirty tree; builds the image tagged with the commit — the SPA plus this month's DB-IP Country Lite file (US-only posting; `King__Posting__CountryDatabase` set in the image, so no Azure setting) downloaded at each deploy; pushes it to GHCR; rolls the app onto it, waits until the new revision is ready, then runs `smoke.sh` against `https://kingofwees.com` once it's bound (else the Container Apps address). |
| `restore-drill.sh [archive]` | Restores the newest backup (or a downloaded one, its `.log` beside it) into a throwaway local `mongo:8.0` container; fails unless every collection holds exactly what mongodump logged dumping and every `adminLog` time is a date. Restores data only: DocumentDB's index and collection options don't load into plain Mongo. Shows production's counts beside them (they drift as people post). Needs Docker and `az login`. |
| `smoke.sh https://host` | `/health` answers `Healthy`, `/api/king/status` 200, `/api/admin/check` 401 without a key, `/api/king/posting` allows this machine (run it from the US) — over HTTPS with a valid certificate. |

Settings come from files in `~/.kingofwees/` (outside the repo, `chmod 600`), read by `provision.sh`, never printed: `documentdb.conn` (required, with `/king`), `admin-key.hash` (optional; production deliberately uses the same key as development — Wallie's choice, 2026-10-11; replace it with a new hash as in "Rotating the admin key" if that key may have been seen), `map-center` as `latitude,longitude` (optional). Change one, rerun `provision.sh`.

The app creates one index itself: the audit log's 1-year expiry on the `adminLog` collection, on the first admin sign-in or change. A restore into plain Mongo can't bring it back (DocumentDB stores it with an option plain Mongo refuses); the app recreates it on its first admin sign-in or change after starting, and records that already exist then expire too.

First deploy: `deploy.sh` (pushes; no app yet) → make the package public → `azure/provision.sh ghcr.io/pithy-platypus/kingofwees:<tag>` → `smoke.sh`. After that, `deploy.sh` alone.

## Telemetry and alerts

- **Traces and logs:** portal → `kingofwees-insights` → Transaction search or Logs. Nothing personal is exported (`TelemetryPrivacyTests` covers spans and logs). The workspace stops taking data for the rest of the day at 0.05 GB.
- **Memory, CPU, restarts:** portal → container app `kingofwees` → Metrics (`Memory Working Set Bytes`, `CPU Usage`, `Total Replica Restart Count`). These are free platform metrics; the app's own OpenTelemetry metrics aren't kept (the agent can't send metrics to Application Insights).
- **A failed backup:** an email from `kingofwees-alerts`, then another when it resolves. Check the job's execution history and the run's `.log` in `kingofweesbackups/backups`.

## Restoring a backup

Backups: `kingofweesbackups` → `backups`, one `king-<UTC time>.archive.gz` and its `.log` a night, kept 30 days. A restore replaces the whole `king` database; entries posted after the backup are lost.

1. **Back up what's there now**, if the cluster still answers — `--drop` deletes each collection before recreating it, so a restore that fails halfway leaves it empty (seen on local Mongo):
   `az containerapp job start -g kingofwees.com -n kingofwees-backup`, then wait for `Succeeded` in
   `az containerapp job execution list -g kingofwees.com -n kingofwees-backup --query "[0].properties.status" -o tsv`.
2. **Pick a backup and download it with its log** (set `B` to the name of the one to restore):
   ```sh
   az storage blob list --auth-mode login --account-name kingofweesbackups -c backups --query "[].name" -o tsv
   B=king-2026-10-11T200535Z
   mkdir -p ~/kingofwees-restore && cd ~/kingofwees-restore
   for f in $B.archive.gz $B.log; do
     az storage blob download --auth-mode login --account-name kingofweesbackups -c backups -n $f -f $f -o none
   done
   ```
3. **Drill it first:** `~/repos/kingofwees.com/infra/restore-drill.sh ~/kingofwees-restore/$B.archive.gz` must pass.
4. **Restore into the cluster** (the connection string reaches mongorestore in a file, and its output is scrubbed — a failing mongo tool prints the password):
   ```sh
   (umask 077; printf 'uri: "%s"\n' "$(<~/.kingofwees/documentdb.conn)" >restore.yaml)
   docker run --rm -v "$PWD:/r" -w /r mongo:8.0 mongorestore --config=restore.yaml --gzip --archive=$B.archive.gz \
     --nsInclude='king.*' --drop 2>&1 | sed -E 's#//[^/@]*@#//***@#g'
   rm restore.yaml
   ```
   If index creation fails, run it again with `--noIndexRestore` added. Into plain Mongo (the VM fallback) add `--noOptionsRestore --noIndexRestore`: DocumentDB's collection and index options don't load there.
5. **Restart the app**, so its first admin sign-in recreates the audit log's expiry index if the restore didn't bring it:
   `az containerapp revision restart -g kingofwees.com -n kingofwees --revision "$(az containerapp show -g kingofwees.com -n kingofwees --query properties.latestRevisionName -o tsv)"`
   Then `infra/smoke.sh https://<host>`, sign in to `/admin` once, and check History.

**A new cluster** (the old one is gone): create it in the portal, allow your address in its firewall, put its connection string with `/king` in `~/.kingofwees/documentdb.conn`, run `azure/provision.sh` (it re-applies the app's and the backup job's secret, adds the "Allow Azure services" rule and restarts the app), then steps 2–5.

Tested: steps 2–3 against the real first backup; step 4's command against local Mongo (with the plain-Mongo flags). Not yet run against DocumentDB itself.

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
