# Patterns

Why the rules in the `CLAUDE.md` files exist: the decision, the incident, the measurement, the rejected alternative. Read before *changing* a rule, not before following one.

| Pattern | Rule it explains |
|---|---|
| [validation.md](validation.md) | FluentValidation only; validated route groups (`source/KingOfWees.Server/CLAUDE.md`) |
| [display-units.md](display-units.md) | Distances shown in feet/miles, never metres or locale-derived (`source/frontend/CLAUDE.md`) |
| [location-privacy.md](location-privacy.md) | Coordinates rounded to 3 decimals in the browser and on the server (`source/frontend/CLAUDE.md`, `source/KingOfWees.Server/CLAUDE.md`) |
