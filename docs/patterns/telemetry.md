# Telemetry

Production telemetry goes from the app straight to Application Insights (`kingofwees-insights`, workspace `kingofwees-logs`) through the Azure Monitor exporter (`Azure.Monitor.OpenTelemetry.Exporter`), when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set (`source/KingOfWees.Server/Extensions.cs`). Locally, Aspire's `OTEL_EXPORTER_OTLP_ENDPOINT` sends everything to the dashboard as before.

| Signal | Exported | Why |
|---|---|---|
| Traces (requests, dependencies) | Every one of the API's: `SamplingRatio = 1.0f`, `TracesPerSecond = null`. Only `/api` paths are traced (the instrumentation's `Filter`), and `NoiseFilter` drops the health check's database ping and unknown `/api` paths | The event alerts count request rows; a sampled-away post would send no email. Pages and files tell nothing the API rows don't, and a request nobody traces can't spend the daily cap |
| Logs | Every one | Same pipeline as before; `PersonalDataScrubber` and the privacy tests still apply |
| Metrics | Only the `KingOfWees` meter (`KingMetrics`); a View drops every other instrument, and the exporter's own performance counters and standard metrics are off (`EnablePerformanceCounters`, `EnableStandardMetrics`) | The runtime and ASP.NET Core instruments alone pass the daily cap; the exporter's five counters a minute were ~3.5 MB a day |
| Live Metrics | Off | Streams outside what the privacy tests cover; nobody watches it |

`AzureMonitorExportTests` pin the first and third rows: 30 requests with a not-sampled `traceparent` give 30 server spans; pages, files, `/api/nope` and `/api/king/nothing` give no server span while `/api/version` and a photo route's 404 do; both exporter flags read false; with the connection string only `king.*` metrics leave, without it every instrument does. `NoiseFilterTests` pin the processor: a child of a request the filter left out, or a request on the `/api/{**rest}` route, is un-recorded (the export processors skip an unrecorded span); a child of a traced request and a 404 on a real route stay.

## In Azure (`infra/azure/provision.sh`)

- The app gets `APPLICATIONINSIGHTS_CONNECTION_STRING` as a secret (read from the Application Insights resource at run time, never passed on a command line), plus `OTEL_SERVICE_NAME=kingofwees` and `OTEL_RESOURCE_ATTRIBUTES=service.namespace=kingofwees-env`: the agent used to name the service. The role name is now `[kingofwees-env]/kingofwees` (the exporter's format; the agent wrote `kingofwees-env.kingofwees`, so rows before 2026-10-20 13:47 UTC carry that). No alert or query filters on it.
- The environment's agent is deleted while it's on (left on, every row would arrive twice).
- The script refuses an image whose commit has no Azure Monitor exporter in `Extensions.cs`: with the agent gone, such an image would run with no telemetry at all and nothing would say so. Deploy first, then provision.
- Alerts read the real `ResultCode`: `kingofwees-king-seen-or-fed` and `kingofwees-photo-posted` on `'201'`, `kingofwees-server-errors` on `>= 500` (not 4xx: scanners' 404s and visitors' 499s are failed requests too).

## The browser's errors (`/api/client-diagnostics`)

Until 2026-10-20 nothing the browser hit reached us: no error handlers, no error boundary, so a screen that failed to draw left a blank page and no record anywhere. Now `src/diagnostics.ts` reports script errors and promises nobody caught (window listeners) and screens that failed to draw (React 19's `onCaughtError` on the root; `ErrorBoundary` shows "Something went wrong" with Reload instead of a blank page). Each report is `{ kind, message, stack, path, version }`: the page's path only (a query string can carry what someone typed), the build's version, never the device key or a name. Sent with `navigator.sendBeacon` (it outlasts the page being reloaded or left), `fetch` with `keepalive` where there's no beacon; at most 5 a page load, the same failure once. Failed API calls aren't reported: the server already has a row for each.

The server (`Diagnostics/ClientDiagnostics.cs`) validates it like any request, removes invisible characters (line breaks in the stack kept), logs one warning and stores nothing. Decided with Wallie (2026-10-19):

- **Outside the `/api/king` writes group**, which carries `PostingCountryFilter`: a visitor abroad whose page breaks is worth hearing about, and nothing they send is stored or shown to anyone. The server `CLAUDE.md` rule on public writes names it as the one exception.
- **Two limits**: 10 a minute per visitor, and 20 a minute across every visitor (120 until 2026-10-24: budgeted in rows, when a report may carry ~2 KB — 120 of the old 4,000-character stacks a minute could have spent the day's cap in about an hour; the stack is now cut to 1,500 characters, the top frames, in `ClientDiagnostic.MaxStackLength` and the frontend's `MAX_STACK`). Without the second, reports from many addresses could spend the workspace's 0.05 GB a day and stop telemetry until 18:00 UTC; refused reports don't spend it.
- **Someone reads them**: `kingofwees-browser-errors` (`infra/azure/provision.sh`) emails when an `AppTraces` row with category `KingOfWees.Server.Diagnostics.ClientDiagnostic` lands. Until 2026-10-24 nothing did: a visitor's broken page on 2026-10-21 ("Unable to preload CSS for …/assets/MapView-….css" — a tab open since before a deploy asking for a chunk the new build no longer had) sat unread for three days.
- **A stale tab reloads itself once** (`watchPreloadError`, `src/diagnostics.ts`): on Vite's `vite:preloadError` the page reloads, which fetches the new build, remembering in `sessionStorage` (`king.preloadReloaded` = the build's version) that this build reloaded in this tab; a page that fails again reports a `render` instead of looping, and a newer build may reload once more.
- **JSON only**: another site can post `text/plain` from a visitor's browser without asking; `application/json` needs a preflight this site never answers. A `text/plain` post doesn't match the endpoint and falls through to the `/api` 404.
- `BrokenPageTests` (E2E) forces a reply Home can't draw and checks the fallback, focus, axe and the 204 report.

Rejected: the Application Insights JavaScript SDK — it sets `ai_user`/`ai_session` cookies by default (the Privacy page promises none), needs `connect-src` to Azure in the Content-Security-Policy, and is a third-party script on a page that keeps the admin key in `localStorage`.

## Why not the Container Apps agent (found 2026-10-19)

The environment's managed OpenTelemetry agent (`az containerapp env telemetry app-insights set`) took the app's OTLP and wrote it to Application Insights, but never mapped `http.response.status_code`: all 12,912 requests of the 30 days before read `ResultCode` 0 and `Success` true, 404s, 499s and any 500 alike. The Failures blade, failure-rate charts and any alert on failed requests could never fire, and every query had to read `Properties['http.response.status_code']` instead. Querying that property everywhere was rejected: every future query or alert would have to remember it, and one that forgot would run, return nothing and look healthy.

## Measured in the spike (2026-10-19, two local runs as `kingofwees-dev`)

- `ResultCode` real for 200, 404, 405, 499 and 500. `Success` is false for **every code ≥ 400**: scanners' 404s count as failures. Wallie kept that (the data stays honest); alerts fire only on 5xx and the Failures blade is filtered by response code when needed.
- Sampling: since #54942 the exporter defaults to `RateLimitedSampler` at 5 traces a second (so does the `Azure.Monitor.OpenTelemetry.AspNetCore` distro). With the two settings above, 60 of 60 requests arrived, the 5 with a not-sampled `traceparent` too, and `OTEL_TRACES_SAMPLER=microsoft.rate_limited` didn't override them.
- Privacy: no query string, user agent or forwarded address in any row; `url` is scheme, host and path; `client_IP` 0.0.0.0.
- Metrics, everything exported: ~72 rows (≈37 kB) per 60 s export, about 53 MB a day against the 50 MB cap (all other telemetry was ~3.5 MB a day). The exporter's reader is **Delta**, and with Delta a series with no new measurement isn't exported again (probed: one `Add`, three collections → 1, 0, 0 points; Cumulative → 1, 1, 1). So the `KingOfWees` counters (at most 12 series) cost a row only in a minute when something happened, and the default 60 s interval stays. The exporter also sends `_APPRESOURCEPREVIEW_` rows (the service's resource attributes; why that often isn't documented): measured live on 2026-10-20 at about 6.5 a minute, ~680 bytes each — about 6 MB a day, with the rest of the telemetry (~3.5 MB a day) well inside the 50 MB cap. The spike missed it: one short run sent a single one.
- Measured again 2026-10-21 → 24 (`Usage`, billable): 19–21 MB a day, not the ~9.5 projected — `AppDependencies` 8.9 MB, of which the readiness probe's `ping king` 8,641 rows a day (a child of the untraced `/health` request, recorded all the same: the exporter's sampler doesn't ask the parent), `_APPRESOURCEPREVIEW_` 5.8 MB, `AppPerformanceCounters` 3.5 MB (five counters a minute from the exporter itself, outside the View), real content ~1.6 MB. Hence `NoiseFilter`, the `/api`-only trace filter and the two exporter flags (2026-10-24); whether `_APPRESOURCEPREVIEW_` goes with the standard metrics is measured after the deploy, not assumed.

## The daily cap

The workspace stops taking rows past 0.05 GB a day until 18:00 UTC (`infra/azure/provision.sh`), and nothing that lands after that exists: the three request alerts can't fire, and until 2026-10-24 nothing said so. Rows average ~790 bytes, so a flood of ~64,000 requests reaches the cap — minutes with a script, and until 2026-10-24 any path counted: pages, files, the SPA's 404s and the `/api/{**rest}` fallback have no rate limiter. Now only `/api` paths are traced, unknown ones dropped, and the real routes are under the read and write limits; the browser's reports are budgeted in bytes (20 a minute of at most ~2 KB, `ClientDiagnosticsTotalPerMinute` and `MaxStackLength`). The cap stays at 0.05 GB: it bounds the cost, and raising it only raises the price of the same flood. `kingofwees-telemetry-capped` emails when `_LogOperation` (not billable, not capped) records an `OverQuota` event.

## Rejected

- **The `Azure.Monitor.OpenTelemetry.AspNetCore` distro (`UseAzureMonitor()`)**: it adds its own ASP.NET Core and HttpClient instrumentation beside the service defaults' (and their health-check filter), and samples the same way by default. The exporter alone plugs into the existing pipeline.
- **A sampler for the noise** (a custom sampler dropping `ping` or 404s): a sampler decides when a span starts, before its route and status are known, and any sampler on the API could lose a post's row and its email. `NoiseFilter` decides at the end, on the finished span, by un-recording it.
- **Raising the cap**: it bounds the cost of a flood; a higher cap is the same blindness at a higher price.
- **Exporting every metric every 15 minutes** (~3.5 MB a day): gauges sampled four times an hour, and request rows already answer what the runtime and ASP.NET Core instruments measure.
