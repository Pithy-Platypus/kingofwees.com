# Patterns

Why the rules in the `CLAUDE.md` files exist: the decision, the incident, the measurement, the rejected alternative. Read before *changing* a rule, not before following one.

| Pattern | Rule it explains |
|---|---|
| [validation.md](validation.md) | FluentValidation only; validated route groups; names cleaned of invisible characters before they're checked (`source/KingOfWees.Server/CLAUDE.md`) |
| [display-units.md](display-units.md) | Distances shown in feet/miles, never metres or locale-derived (`source/frontend/CLAUDE.md`) |
| [location-privacy.md](location-privacy.md) | Coordinates rounded to 3 decimals in the browser and on the server (`source/frontend/CLAUDE.md`, `source/KingOfWees.Server/CLAUDE.md`) |
| [visitor-address.md](visitor-address.md) | Rate limits see the visitor's address behind Container Apps: one trusted hop, only with `King:Proxy:TrustForwardedFor` (`source/KingOfWees.Server/CLAUDE.md`) |
| [health-checks.md](health-checks.md) | `/health` and `/alive` mapped in every environment; liveness without the database; a connection string must name the database (`source/KingOfWees.Server/CLAUDE.md`) |
| [posting-country.md](posting-country.md) | Posting (not reading, not `/admin`) only from US addresses: an endpoint filter on the writes group, DB-IP Country Lite in the image, unknown addresses allowed (`source/KingOfWees.Server/CLAUDE.md`) |
| [admin-key.md](admin-key.md) | Admin key stored as a hash; admin routes only in `/api/admin`, unmapped without a hash; hidden entries and devices filtered in every store read; every admin action recorded in the audit log (`source/KingOfWees.Server/CLAUDE.md`) |
| [photos.md](photos.md) | Uploaded photos stored only after the server strips their metadata; the device key in a header, never the form; upload forms bind through properties; body size limits (`source/KingOfWees.Server/CLAUDE.md`) |
| [undo.md](undo.md) | Undo on one's own posts from Lately, the history page and Photos: the browser remembers its own posts for the server's 10 minutes, asked in place; no server "yours" flag |
| [security-headers.md](security-headers.md) | Content-Security-Policy, HSTS and the rest on every response; a new external origin must join the policy, which only production sends (`source/frontend/CLAUDE.md`) |
| [request-limits.md](request-limits.md) | Per-visitor read and photo-file limits beside the write limit; the innermost policy replaces the group's; photo uploads at once across every visitor; 64 KB request bodies except photo uploads (`source/KingOfWees.Server/CLAUDE.md`) |
| [hosting.md](hosting.md) | Hosting on Azure Container Apps: one always-warm replica (rate limits in memory), DocumentDB free tier, Cloudflare DNS only, our own deploy script; telemetry and backups (`infra/README.md`) |
| [site-size.md](site-size.md) | Scripts and styles compressed once at build and cached for good, pages rechecked; Leaflet on demand (lint-enforced); one shared `@apply btn` (`source/frontend/CLAUDE.md`) |
| [mutation-testing.md](mutation-testing.md) | StrykerJS with `--force` after any test change: the command runner makes incremental mode reuse stale results (`source/frontend/CLAUDE.md`); why the `threads` pool and `--bail=1`, and the faster setups declined |
| [telemetry.md](telemetry.md) | Telemetry straight to Application Insights through the Azure Monitor exporter, not the Container Apps agent; only `/api` requests traced, every one kept, noise (the health check's ping, unknown `/api` paths) dropped by a processor, never a sampler; only the `KingOfWees` meter exported, the exporter's own counters off; an alert when the daily cap is hit; the browser's errors through `/api/client-diagnostics`, outside the writes group (`source/KingOfWees.Server/CLAUDE.md`) |
| [versioning.md](versioning.md) | One version, `<UTC commit date>+<commit>` without leading zeros, worked out only by `source/version.sh`; `/api/version`, `service.version`, the About page and the deploy check (`CLAUDE.md`) |
