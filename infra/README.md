# infra

kingofwees.com runs on Azure Container Apps at https://kingofwees.com and https://www.kingofwees.com (live since 2026-10-11), with the Azure DocumentDB free tier as its database. Cloudflare is registrar and DNS (DNS only). Everything is created and deployed by the scripts here, run from Wallie's Mac. Why this shape, and what was rejected: `docs/patterns/hosting.md`.

## What runs where

All in subscription "Playground", resource group `kingofwees.com`, East US.

| Resource | What it is |
|---|---|
| `kingofwees-env` | Container Apps environment. Console logs aren't kept; its OpenTelemetry agent sends the app's traces and logs to `kingofwees-insights`. |
| `kingofwees` | The app: one replica (min 1, max 1 — the rate limits live in memory, so a second replica would double them), 0.25 vCPU / 0.5 GiB, external HTTPS ingress on port 8080, readiness `/health` (database included), liveness `/alive` (app only). A system-assigned identity with Storage Blob Data Contributor on `kingofweesphotos/photos` only; `ConnectionStrings__photos` is the blob address (not a secret — there's no storage key). Settings are secrets: the DocumentDB connection string, the admin key hash, the map center; `King__Proxy__TrustForwardedFor=true` so rate limits see each visitor (never set it where the app is reachable without the ingress). Custom domains `kingofwees.com` and `www.kingofwees.com` with free managed certificates. |
| DocumentDB cluster | Free tier (MongoDB API, 32 GB), database `king`. Firewall rule "Allow Azure services": the app's outbound addresses are a shared pool of hundreds, so they can't be listed; connections still need the cluster's credentials over TLS. |
| `kingofwees-backup` | Scheduled job, nightly at 08:00 UTC: `azure/backup.sh` in the stock `mongo:8.0` image (pinned by digest) dumps the database and uploads it with its own managed identity. |
| `kingofweesbackups` | Storage account; private container `backups`, blobs deleted after 30 days, shared keys off. The job may write only there; the signed-in account may read it (for the drill). |
| `kingofweesphotos` | Storage account for photos (Slice 6); private container `photos`, shared keys off, Hot, **blob soft delete 30 days**. Separate from backups: soft delete is per account, and the backups' delete rule must never touch photos. Only the app may read and write it. |
| `kingofwees-insights`, `kingofwees-logs` | Application Insights and its Log Analytics workspace: traces and logs, 31 days, capped at 0.05 GB a day. |
| `kingofwees-alerts`, `kingofwees-backup-failed` | Action group (email to the signed-in account) and the metric alert that uses it when a backup run fails. |
| `kingofwees-king-seen-or-fed`, `kingofwees-photo-posted` | Log search alerts on `kingofwees-logs`, every 15 minutes, emailing through `kingofwees-alerts` when a sighting or feeding, or a photo, was posted. |
| `kingofwees-monthly` | Budget: $25 a month on the resource group; emails at 80% actual and 100% forecast. |

Images: `ghcr.io/pithy-platypus/kingofwees`, public (they hold no secrets), tagged with the commit (a version's `+` isn't allowed in a tag) and labelled `org.opencontainers.image.version` with the full version.

**Photos are not in the nightly backup**, which dumps only the database: a deleted or overwritten photo file can be recovered for 30 days through `kingofweesphotos`'s soft delete, and nothing protects the files beyond that. Measured for photos (Slice 6 step 8, at 0.25 vCPU / 0.5 GiB): uploads settle the server at about 310–335 MiB, so the size stays.

## Costs

About $6–7 a month: the app at the idle rate (measured size, Slice 5 step 1; still enough with photos, Slice 6 step 8), photo storage cents (~0.8 GB a year at 5 photos a day), the database $0 (free tier), backups cents, telemetry $0 inside the 5 GB a month free per billing account (at most about $4 if that allowance is used elsewhere — the daily cap bounds it), the backup alert and all emails $0 (free allowance), the two log search alerts about $1 (about $0.50 each at a 15-minute frequency), certificates $0.

## Scripts (run from Wallie's Mac)

| Script | Does |
|---|---|
| `azure/provision.sh [image]` | Creates or brings up to date everything in the table above, from the settings below. Binds each custom domain once its Cloudflare records resolve (it says which are missing otherwise). Safe to rerun: re-applies the app's settings (keeping its bound domains) and restarts it. Refuses an image GHCR won't serve anonymously and a connection string without a database name. |
| `deploy.sh` | Refuses a dirty tree and a commit not yet pushed to GitHub (the About and Privacy pages link to it); works out the version with `source/version.sh`; builds the image tagged with the commit — the SPA plus this month's DB-IP Country Lite file (US-only posting; `King__Posting__CountryDatabase` set in the image, so no Azure setting) downloaded at each deploy; pushes it to GHCR; rolls the app onto it, waits until the new revision is ready, then runs `smoke.sh` against `https://kingofwees.com` once it's bound (else the Container Apps address), and fails unless `/api/version` there reports this version for both halves. |
| `restore-drill.sh [archive]` | Restores the newest backup (or a downloaded one, its `.log` beside it) into a throwaway local `mongo:8.0` container; fails unless every collection holds exactly what mongodump logged dumping and every `adminLog` time is a date. Restores data only: DocumentDB's index and collection options don't load into plain Mongo. Shows production's counts beside them (they drift as people post). Needs Docker and `az login`. |
| `smoke.sh https://host` | `/health` answers `Healthy`, `/api/king/status` 200, `/api/admin/check` 401 without a key, `/api/king/posting` allows this machine (run it from the US), the page's main script arrives brotli-compressed and cached `immutable` and the page itself `no-cache` (a build that stopped writing the compressed copies shows here) — over HTTPS with a valid certificate. |

Mongo tools print the whole connection string, password included, when they fail: every script passes it in a `--config` file and scrubs their output. Keep that for any new mongo tool call.

## Settings

Files in `~/.kingofwees/` (outside the repo, `chmod 600`), read by `provision.sh`, never printed. Change one, rerun `provision.sh`.

| File | Holds |
|---|---|
| `documentdb.conn` | Required. The cluster's connection string with `/king` added before the `?` — the server refuses to start without a database name. |
| `admin-key.hash` | Optional (no admin routes without it). The admin key's hash only, from `dotnet run source/tools/new-admin-key.cs`. Production deliberately uses the same key as development — Wallie's choice, 2026-10-11; rotate it (below) if that key may have been seen. |
| `map-center` | Optional (no maps without it): `latitude,longitude`. |

The app creates one index itself: the audit log's 1-year expiry on the `adminLog` collection, on the first admin sign-in or change. A restore into plain Mongo can't bring it back (DocumentDB stores it with an option plain Mongo refuses); the app recreates it on its first admin sign-in or change after starting, and records that already exist then expire too.

## Deploying

Commit and push, then `infra/deploy.sh`. It takes a few minutes; the previous revision keeps serving until the new one is ready, and stays if the new one never becomes ready. It prints the version it deploys (`source/version.sh`, e.g. `2026.10.18+f349dc1e5d2a`), and after the smoke test checks that `https://kingofwees.com/api/version` reports it for both the server and the frontend; a tester sees the same on the About page.

A release that needs new Azure resources or settings runs `azure/provision.sh` **first**: the server refuses to start without a setting it needs (since Slice 6, `ConnectionStrings__photos`), so the new revision would never become ready. Photos went live this way: `provision.sh` (photo storage, the app's identity and role, the setting — the old image ignores it), then `deploy.sh`.

## Custom domains (Cloudflare)

Four records, all **DNS only** (grey cloud) — the managed certificate is issued and renewed only while DigiCert reaches the app directly:

| Type | Name | Value |
|---|---|---|
| A | `@` | the environment's static IP (`az containerapp env show -g kingofwees.com -n kingofwees-env --query properties.staticIp -o tsv`) |
| TXT | `asuid` | the app's domain verification ID (`az containerapp show -g kingofwees.com -n kingofwees --query properties.customDomainVerificationId -o tsv`) |
| CNAME | `www` | the app's Container Apps address (`… --query properties.configuration.ingress.fqdn`) |
| TXT | `asuid.www` | the same verification ID |

No CAA record, or one that allows `digicert.com`. The IP changes only if the environment is recreated. Certificates renew automatically; check with `az containerapp env certificate list -g kingofwees.com -n kingofwees-env --managed-certificates-only -o table`.

## Telemetry and alerts

- **Traces and logs:** portal → `kingofwees-insights` → Transaction search or Logs. Nothing personal is exported (`TelemetryPrivacyTests` covers spans and logs). The workspace stops taking data for the rest of the day at 0.05 GB.
- **Memory, CPU, restarts:** portal → container app `kingofwees` → Metrics (`Memory Working Set Bytes`, `CPU Usage`, `Total Replica Restart Count`). These are free platform metrics; the app's own OpenTelemetry metrics aren't kept (the agent can't send metrics to Application Insights).
- **King seen or fed, a photo posted:** at most one email per rule per 15-minute run (with how many arrived), 15–30 minutes after the post; no "resolved" email. Undone entries and photos still count. Nothing arrives while the workspace's daily cap is hit.
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

## Rotating the admin key (e.g. it leaked)

1. `dotnet run source/tools/new-admin-key.cs` in your own terminal — prints a new key and its hash. Put the key in your password manager.
2. Put the hash (only) in `~/.kingofwees/admin-key.hash` and rerun `azure/provision.sh`; it updates the secret and restarts the app (a secret change alone doesn't reach a running revision).
3. The old key stops working as soon as the new hash is live; nothing else holds it.
4. On each device you moderate from, open `/admin` and enter the new key.

A value that isn't a 64-character hex hash (e.g. the key pasted by mistake) stops the server starting, so a bad paste shows at once.

## One-time setup (already done)

**GHCR.** The image is `ghcr.io/pithy-platypus/kingofwees` (`Pithy-Platypus` is an organization).

1. Organization settings → Packages → Package creation: **Public** allowed (an owner does this).
2. github.com/settings/tokens → **Generate new token (classic)** with `write:packages` only (fine-grained tokens can't push to GHCR); if the organization uses SSO, authorize the token for it. An expired token only stops deploys.
3. In your own terminal: `docker login ghcr.io -u <github-username>` and paste the token at the prompt (Docker Desktop keeps it in the macOS Keychain).
4. After the first push: the package → Package settings → **Change visibility → Public** (GHCR creates every package private; no API changes it). Public is safe: the image holds no secrets. The image's `org.opencontainers.image.source` label should connect it to `kingofwees.com`; if the package page doesn't show the repository, **Connect repository** there.

**First deploy:** `deploy.sh` (pushes; no app yet) → make the package public → `azure/provision.sh ghcr.io/pithy-platypus/kingofwees:<tag>` → add the Cloudflare records → rerun `provision.sh` → `smoke.sh`. After that, `deploy.sh` alone.

## Fallback

If Container Apps or DocumentDB stop working out: one Azure VM running the app and Mongo with Docker Compose, Cloudflare's proxy in front with an origin certificate in Kestrel, port 443 open only to Cloudflare's address ranges (`docs/patterns/hosting.md`). Restore into its plain Mongo as in "Restoring a backup", with the plain-Mongo flags.
