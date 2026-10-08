# Request validation: FluentValidation, not DataAnnotations

**Decided:** 2026-10-08, standard for all request types going forward.

## Why fluent

- **Error codes are first-class.** The API returns codes (`reporterName.tooLong`) that the frontend translates. DataAnnotations only offers `ErrorMessage`, a sentence slot we would be overloading; FluentValidation has `.WithErrorCode()` separate from the message.
- **Upcoming rules are conditional** (photo captions, invite-only posting, undo windows). `.When()`, `.Must()` and `MustAsync()` express these; attributes need custom attribute classes or `IValidatableObject`.
- **Validators are unit-testable without HTTP** (`FluentValidation.TestHelper`). This found a real gap: the HTTP tests only posted feedings, so removing the sighting validator's rules went unnoticed until validators were tested directly.

## Rejected: DataAnnotations + .NET 10 `AddValidation()`

- Zero dependencies and built in — its real advantage.
- The expected bonus, constraints appearing in the OpenAPI document, did **not** happen: with attributes on record constructor parameters, `/openapi/v1.json` showed no `maxLength` and marked every positional parameter required (checked 2026-10-08).
- A 2026 blog claims .NET 11 deprecates the built-in pipeline; unverified, but it added risk.

## How it is wired

- `ValidationFilter` (endpoint filter) on the `/api/king` route group validates any argument with a registered `IValidator<T>` and returns `400` `ValidationProblem` with codes keyed by camelCase field.
- Validators are registered by assembly scan (`AddValidatorsFromAssemblyContaining`).
- Guard test: `Every_request_body_type_has_a_FluentValidation_validator`.

## Incident found while switching

`JsonStringEnumConverter` accepts integers by default, so `"food": 7` was stored as an invalid `Food`. Enum fields need `.IsInEnum()`; covered by `Numeric_food_outside_the_known_values_is_rejected_with_an_error_code`.

## Cost

One dependency (`FluentValidation.DependencyInjectionExtensions`, Apache-2.0, pinned in `Directory.Packages.props`) and a ~30-line filter. Re-check the license before major upgrades — other .NET libraries (e.g. FluentAssertions v8) moved to commercial licenses.
