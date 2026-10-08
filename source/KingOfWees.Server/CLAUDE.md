# KingOfWees.Server

- **Minimal APIs only.** Map endpoints with `MapGroup`/`MapGet`/`MapPost`; no controllers, no `AddControllers()`/`AddMvc()`.
- **Validate with FluentValidation only.** One `AbstractValidator<T>` per request type, failures carry `.WithErrorCode("field.reason")` — the client translates codes, so never rely on messages. DataAnnotations attributes are not wired up (there is no `AddValidation()`): they compile and silently validate nothing.
- **New endpoints go in a route group that has `ValidationFilter`** (today: `/api/king`). An endpoint mapped outside such a group skips validation; the guard test `Every_request_body_type_has_a_FluentValidation_validator` catches a missing validator, not a missing filter.

Why → `docs/patterns/validation.md`.
