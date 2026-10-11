# Hosting on Azure Container Apps

How kingofwees.com runs is in `infra/README.md`. This page is why: the choices made in Slice 5 (`PLAN.md`), what they cost, what was rejected, and what went wrong along the way.

## The shape

One Azure Container Apps (ACA) app, **one replica, always warm**, at the smallest size (0.25 vCPU / 0.5 GiB), on the Consumption plan. Database: the **Azure DocumentDB free tier** (MongoDB API, 32 GB). Images on **GitHub Container Registry (GHCR)**, built and rolled out by `infra/deploy.sh` from Wallie's Mac. **Cloudflare** stays registrar and DNS, with records **DNS only**. Budget: under $25 a month, with an Azure budget alert at $25.

## Why

- **Always warm, not scale to zero.** Neighbors open the site when King turns up; a cold start costs them seconds at the one moment it matters. At the idle rate one small replica costs about $6 a month.
- **Exactly one replica.** The write and admin rate limits live in the process's memory, so a second replica would double every limit and nothing would fail. More replicas need the limits in a shared store first.
- **The smallest size held.** Measured before anything was created (Slice 5 step 1, image capped at 0.25 CPU / 512 MiB): a simulated neighborhood evening plus a "King's here" spike peaked at 7.7% of a core and 98 MiB with no errors; a 2,100-request stress burst peaked at 25% of a core and 89 MiB. About 5× memory headroom.
- **DocumentDB, not a Mongo container.** Mongo can't run on ACA: its network file shares corrupt Mongo's data directory. The free tier is effectively unlimited here — a year of entries at 4 a day dumps to 44 KB. The store contract tests passed against it (46/46) before go-live.
- **Our own deploy script, not `aspire deploy`.** Aspire's Container Apps environment adds an Azure Container Registry (about $5 a month), a Log Analytics workspace and the dashboard by default. GHCR is free for a public repository, and the image holds no secrets.
- **Cloudflare DNS only.** ACA's free managed certificate (DigiCert) is issued and renewed only while DigiCert reaches the app directly: an A record to the environment's IP for the apex, a CNAME straight to the app's address for `www`. Cloudflare's proxy breaks both. A CAA record, if one is ever added, must allow `digicert.com`.

## Rejected, with costs

| Option | Why not |
|---|---|
| One VM (B1ms) with Docker Compose | ~$22 a month, plus OS patching, a firewall and a certificate to look after. Kept as the fallback below. |
| Scale to zero on free tiers | ≈ $0, but cold starts. |
| Every container on ACA (Mongo and the dashboard too) | Always-on database and telemetry billed per second: the most expensive shape, and Mongo can't run there anyway. |
| Azure DNS | Domains on Cloudflare Registrar must keep Cloudflare's nameservers. |
| Azure Front Door | $35+ a month. |
| Let's Encrypt in Kestrel | Renewals become ours; LettuceEncrypt is archived. |

## Telemetry

The environment's managed OpenTelemetry agent (no compute charge) sends the app's traces and logs to Application Insights, stored in a Log Analytics workspace: the first 5 GB a month per billing account are free, and a 0.05 GB-a-day cap keeps the worst case to about $4 a month. The agent sets `OTEL_EXPORTER_OTLP_ENDPOINT` in the app, so the existing exporter switched on without a code change. It can't send metrics to Application Insights, so memory, CPU and restarts come from ACA's free platform metrics.

Rejected: ACA's managed Aspire dashboard (preview, price not documented, telemetry in memory only — a restart loses it) and our own dashboard app (~$6 a month more, in memory only, needs its own sign-in).

Nothing personal is exported: the span scrubber and `TelemetryPrivacyTests` (spans and logs) guard that. After go-live every `client_IP` in Application Insights read `0.0.0.0`.

## Backups

Backups are ours rather than the free tier's (the first comparison noted the free tier has none; not re-verified since), so a scheduled ACA job runs `mongodump` nightly in the stock `mongo:8.0` image (pinned by digest — no image of ours to build) and uploads with its own managed identity (no storage key). A backup counts only once restored: `infra/restore-drill.sh` restores into a throwaway local Mongo and checks every collection's count. A metric alert on the job's failed executions emails Wallie (metric alerts and the emails are within Azure Monitor's free allowance).

## What went wrong on the way

- **`/health` answered 200 with the database down** in the built image: the health endpoints were mapped only in Development, so the SPA fallback answered them. They're mapped in every environment now (`health-checks.md`).
- **Every request was a 500** with the portal's DocumentDB connection string: it names no database, so no `IMongoDatabase` was registered. Startup now refuses a connection string without one.
- **Every visitor would have shared one rate limit** behind ACA's ingress (`visitor-address.md`).
- **Failing mongo tools print the whole connection string, password included.** Every script passes the URI in a `--config` file and scrubs the tools' output.
- **Re-applying the app's definition could drop its custom domains**: `provision.sh` re-applies the whole definition on every run, so it carries the bound domains over.

## Fallback

If ACA or DocumentDB stop working out: one Azure VM running the app and Mongo with Docker Compose, Cloudflare's proxy in front with an origin certificate in Kestrel, port 443 open only to Cloudflare's address ranges. Restoring a backup into plain Mongo needs `--noOptionsRestore --noIndexRestore` (`infra/README.md` → "Restoring a backup").
