# Patterns

Why the rules in the `CLAUDE.md` files exist: the decision, the incident, the measurement, the rejected alternative. Read before *changing* a rule, not before following one.

| Pattern | Rule it explains |
|---|---|
| [validation.md](validation.md) | FluentValidation only; validated route groups (`source/KingOfWees.Server/CLAUDE.md`) |
| [display-units.md](display-units.md) | Distances shown in feet/miles, never metres or locale-derived (`source/frontend/CLAUDE.md`) |
| [location-privacy.md](location-privacy.md) | Coordinates rounded to 3 decimals in the browser and on the server (`source/frontend/CLAUDE.md`, `source/KingOfWees.Server/CLAUDE.md`) |
| [visitor-address.md](visitor-address.md) | Rate limits see the visitor's address behind Container Apps: one trusted hop, only with `King:Proxy:TrustForwardedFor` (`source/KingOfWees.Server/CLAUDE.md`) |
| [health-checks.md](health-checks.md) | `/health` and `/alive` mapped in every environment; liveness without the database; a connection string must name the database (`source/KingOfWees.Server/CLAUDE.md`) |
| [posting-country.md](posting-country.md) | Posting (not reading, not `/admin`) only from US addresses: an endpoint filter on the writes group, DB-IP Country Lite in the image, unknown addresses allowed (`source/KingOfWees.Server/CLAUDE.md`) |
| [admin-key.md](admin-key.md) | Admin key stored as a hash; admin routes only in `/api/admin`, unmapped without a hash; hidden entries and devices filtered in every store read; every admin action recorded in the audit log (`source/KingOfWees.Server/CLAUDE.md`) |
| [photos.md](photos.md) | Uploaded photos stored only after the server strips their metadata; upload forms bind through properties; body size limits (`source/KingOfWees.Server/CLAUDE.md`) |
| [security-headers.md](security-headers.md) | Content-Security-Policy, HSTS and the rest on every response; a new external origin must join the policy, which only production sends (`source/frontend/CLAUDE.md`) |
| [request-limits.md](request-limits.md) | Per-visitor read and photo-file limits beside the write limit; the innermost policy replaces the group's; 64 KB request bodies except photo uploads (`source/KingOfWees.Server/CLAUDE.md`) |
| [hosting.md](hosting.md) | Hosting on Azure Container Apps: one always-warm replica (rate limits in memory), DocumentDB free tier, Cloudflare DNS only, our own deploy script; telemetry and backups (`infra/README.md`) |
| [site-size.md](site-size.md) | Scripts and styles compressed once at build and cached for good, pages rechecked; Leaflet on demand (lint-enforced); one shared `@apply btn` (`source/frontend/CLAUDE.md`) |
| [mutation-testing.md](mutation-testing.md) | StrykerJS with `--force` after any test change: the command runner makes incremental mode reuse stale results (`source/frontend/CLAUDE.md`) |
