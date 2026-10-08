# KingOfWees.Server

- **Minimal APIs only.** Map endpoints with `MapGroup`/`MapGet`/`MapPost`; no controllers, no `AddControllers()`/`AddMvc()`.
- **Validate with FluentValidation only.** One `AbstractValidator<T>` per request type, failures carry `.WithErrorCode("field.reason")` — the client translates codes, so never rely on messages. DataAnnotations attributes are not wired up (there is no `AddValidation()`): they compile and silently validate nothing.
- **New endpoints go in a route group that has `ValidationFilter`** (today: `/api/king`). An endpoint mapped outside such a group skips validation; the guard test `Every_request_body_and_query_type_has_a_FluentValidation_validator` catches a missing validator, not a missing filter. Query-string requests bind through an `[AsParameters]` record — that's what the guard and the filter see; loose query parameters go unvalidated.
- **"Seen" means `SawKing`, not `Kind == Seen`.** Feedings count as sightings unless the food was left out. In Mongo filter with `Ne(SawKing, false)`: documents from before the flag have no field, and `Eq(true)` silently drops them.
- **Coordinates exist only as `GeoPoint`**, which rounds to 3 decimals whenever a coordinate is set (constructor, `with`, JSON, configuration). Never add raw latitude/longitude `double`s to a request, domain record or options class — they bind, store and return unrounded with nothing failing. A Mongo document may hold the two doubles only copied from a `GeoPoint`, and rebuilds one on read.

Why → `docs/patterns/validation.md` (validation), `docs/patterns/location-privacy.md` (coordinates).
