# Telemetry

Production telemetry goes from the app straight to Application Insights (`kingofwees-insights`, workspace `kingofwees-logs`) through the Azure Monitor exporter (`Azure.Monitor.OpenTelemetry.Exporter`), when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set (`source/KingOfWees.Server/Extensions.cs`). Locally, Aspire's `OTEL_EXPORTER_OTLP_ENDPOINT` sends everything to the dashboard as before.

| Signal | Exported | Why |
|---|---|---|
| Traces (requests, dependencies) | Every one: `SamplingRatio = 1.0f`, `TracesPerSecond = null` | The event alerts count request rows; a sampled-away post would send no email |
| Logs | Every one | Same pipeline as before; `PersonalDataScrubber` and the privacy tests still apply |
| Metrics | Only the `KingOfWees` meter (`KingMetrics`); a View drops every other instrument | The runtime and ASP.NET Core instruments alone pass the daily cap |
| Live Metrics | Off | Streams outside what the privacy tests cover; nobody watches it |

`AzureMonitorExportTests` pin the first and third rows: 30 requests with a not-sampled `traceparent` give 30 server spans; with the connection string only `king.*` metrics leave, without it every instrument does.

## In Azure (`infra/azure/provision.sh`)

- The app gets `APPLICATIONINSIGHTS_CONNECTION_STRING` as a secret (read from the Application Insights resource at run time, never passed on a command line), plus `OTEL_SERVICE_NAME=kingofwees` and `OTEL_RESOURCE_ATTRIBUTES=service.namespace=kingofwees-env`: the agent used to name the service, and without them rows would lose the role name `kingofwees-env.kingofwees`.
- The environment's agent is deleted while it's on (left on, every row would arrive twice).
- The script refuses an image whose commit has no Azure Monitor exporter in `Extensions.cs`: with the agent gone, such an image would run with no telemetry at all and nothing would say so. Deploy first, then provision.
- Alerts read the real `ResultCode`: `kingofwees-king-seen-or-fed` and `kingofwees-photo-posted` on `'201'`, `kingofwees-server-errors` on `>= 500` (not 4xx: scanners' 404s and visitors' 499s are failed requests too).

## The browser's errors (`/api/client-diagnostics`)

Until 2026-10-20 nothing the browser hit reached us: no error handlers, no error boundary, so a screen that failed to draw left a blank page and no record anywhere. Now `src/diagnostics.ts` reports script errors and promises nobody caught (window listeners) and screens that failed to draw (React 19's `onCaughtError` on the root; `ErrorBoundary` shows "Something went wrong" with Reload instead of a blank page). Each report is `{ kind, message, stack, path, version }`: the page's path only (a query string can carry what someone typed), the build's version, never the device key or a name. Sent with `navigator.sendBeacon` (it outlasts the page being reloaded or left), `fetch` with `keepalive` where there's no beacon; at most 5 a page load, the same failure once. Failed API calls aren't reported: the server already has a row for each.

The server (`Diagnostics/ClientDiagnostics.cs`) validates it like any request, removes invisible characters (line breaks in the stack kept), logs one warning and stores nothing. Decided with Wallie (2026-10-19):

- **Outside the `/api/king` writes group**, which carries `PostingCountryFilter`: a visitor abroad whose page breaks is worth hearing about, and nothing they send is stored or shown to anyone. The server `CLAUDE.md` rule on public writes names it as the one exception.
- **Two limits**: 10 a minute per visitor, and 120 a minute across every visitor. Without the second, reports from many addresses could spend the workspace's 0.05 GB a day and stop telemetry until midnight UTC; refused reports don't spend it.
- **JSON only**: another site can post `text/plain` from a visitor's browser without asking; `application/json` needs a preflight this site never answers. A `text/plain` post doesn't match the endpoint and falls through to the `/api` 404.
- `BrokenPageTests` (E2E) forces a reply Home can't draw and checks the fallback, focus, axe and the 204 report.

Rejected: the Application Insights JavaScript SDK — it sets `ai_user`/`ai_session` cookies by default (the Privacy page promises none), needs `connect-src` to Azure in the Content-Security-Policy, and is a third-party script on a page that keeps the admin key in `localStorage`.

## Why not the Container Apps agent (found 2026-10-19)

The environment's managed OpenTelemetry agent (`az containerapp env telemetry app-insights set`) took the app's OTLP and wrote it to Application Insights, but never mapped `http.response.status_code`: all 12,912 requests of the 30 days before read `ResultCode` 0 and `Success` true, 404s, 499s and any 500 alike. The Failures blade, failure-rate charts and any alert on failed requests could never fire, and every query had to read `Properties['http.response.status_code']` instead. Querying that property everywhere was rejected: every future query or alert would have to remember it, and one that forgot would run, return nothing and look healthy.

## Measured in the spike (2026-10-19, two local runs as `kingofwees-dev`)

- `ResultCode` real for 200, 404, 405, 499 and 500. `Success` is false for **every code ≥ 400**: scanners' 404s count as failures. Wallie kept that (the data stays honest); alerts fire only on 5xx and the Failures blade is filtered by response code when needed.
- Sampling: since #54942 the exporter defaults to `RateLimitedSampler` at 5 traces a second (so does the `Azure.Monitor.OpenTelemetry.AspNetCore` distro). With the two settings above, 60 of 60 requests arrived, the 5 with a not-sampled `traceparent` too, and `OTEL_TRACES_SAMPLER=microsoft.rate_limited` didn't override them.
- Privacy: no query string, user agent or forwarded address in any row; `url` is scheme, host and path; `client_IP` 0.0.0.0.
- Metrics, everything exported: ~72 rows (≈37 kB) per 60 s export, about 53 MB a day against the 50 MB cap (all other telemetry was ~3.5 MB a day). The exporter's reader is **Delta**, and with Delta a series with no new measurement isn't exported again (probed: one `Add`, three collections → 1, 0, 0 points; Cumulative → 1, 1, 1). So the `KingOfWees` counters (at most 12 series) cost a row only in a minute when something happened, and the default 60 s interval stays.

## Rejected

- **The `Azure.Monitor.OpenTelemetry.AspNetCore` distro (`UseAzureMonitor()`)**: it adds its own ASP.NET Core and HttpClient instrumentation beside the service defaults' (and their health-check filter), and samples the same way by default. The exporter alone plugs into the existing pipeline.
- **Exporting every metric every 15 minutes** (~3.5 MB a day): gauges sampled four times an hour, and request rows already answer what the runtime and ASP.NET Core instruments measure.
