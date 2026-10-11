# Patterns

Why the rules in the `CLAUDE.md` files exist: the decision, the incident, the measurement, the rejected alternative. Read before *changing* a rule, not before following one.

| Pattern | Rule it explains |
|---|---|
| [validation.md](validation.md) | FluentValidation only; validated route groups (`source/KingOfWees.Server/CLAUDE.md`) |
| [display-units.md](display-units.md) | Distances shown in feet/miles, never metres or locale-derived (`source/frontend/CLAUDE.md`) |
| [location-privacy.md](location-privacy.md) | Coordinates rounded to 3 decimals in the browser and on the server (`source/frontend/CLAUDE.md`, `source/KingOfWees.Server/CLAUDE.md`) |
| [visitor-address.md](visitor-address.md) | Rate limits see the visitor's address behind Container Apps: one trusted hop, only with `King:Proxy:TrustForwardedFor` (`source/KingOfWees.Server/CLAUDE.md`) |
| [health-checks.md](health-checks.md) | `/health` and `/alive` mapped in every environment; liveness without the database; a connection string must name the database (`source/KingOfWees.Server/CLAUDE.md`) |
| [admin-key.md](admin-key.md) | Admin key stored as a hash; admin routes only in `/api/admin`, unmapped without a hash; hidden entries and devices filtered in every store read (`source/KingOfWees.Server/CLAUDE.md`) |
