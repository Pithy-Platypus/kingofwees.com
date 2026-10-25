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
- Guard test: `Every_request_body_and_query_type_has_a_FluentValidation_validator` — body types from `IAcceptsMetadata`, query types from the handler's `[AsParameters]` parameters (minimal APIs put the handler `MethodInfo` in endpoint metadata). Loose query parameters (`int? limit`) are invisible to both the guard and `ValidationFilter`, which validates whole arguments; that is why queries bind through a record.

## Names are cleaned before they're checked

**Decided:** 2026-10-19, from the second security review. Nicknames, place names, the admin's typed name and a hide note are shown to other people, and Unicode has characters that show nothing: a right-to-left override (U+202E) makes the rest of a name read backwards, and a zero-width space makes "Porch" and "Porch" plus one invisible character two different places that look the same — a second Porch, or a name passing for a neighbor's. `DisplayText.Clean` removes control characters (`Cc`), format characters (`Cf`) except the zero-width joiner and non-joiner, and the line and paragraph separators, then trims. Each request record has a `Clean*` property (`CleanReporterName`, `CleanName`, `CleanNote`): its validator checks that property (with `OverridePropertyName`, so the code still names the typed field) and its handler stores it, so length, "required" and "taken" judge what will be stored. New writes only: names already stored keep what they have (Wallie's choice).

- **Removed, not refused:** phones and copy-paste slip a direction mark or a zero-width space into names by accident; refusing would turn a harmless nickname into an error the page has to explain.
- **Whole categories, not a list:** a hand-made list misses characters, and new ones join the categories.
- **Kept:** the zero-width joiner holds emoji sequences together (a family emoji), and the zero-width non-joiner is part of how Persian and several Indic scripts are written. Variation selectors are marks, not format characters, so a red heart keeps its colour.
- **Cost:** England's, Scotland's and Wales's flags are built from tag characters (`Cf`), so they arrive as a plain black flag.
- **Rejected:** a JSON converter that cleans every string — it would miss the form field (a shared photo's name) and the header (the admin's typed name), and clean device keys and ids it has no business touching.

## Refusals are logged, codes only (2026-10-25)

`ValidationFilter` logs one Information line per refusal — `Refused POST /api/king/sightings: reporterName: reporterName.tooLong` — the method, the route pattern and the codes by field, never the value, so a phone sending something the server refuses can be diagnosed from `AppTraces` (the workbook's Triage tab) without reproducing it. `TelemetryPrivacyTests` pins that the refused nickname never reaches a log line.

## Incident found while switching

`JsonStringEnumConverter` accepts integers by default, so `"food": 7` was stored as an invalid `Food`. Enum fields need `.IsInEnum()`; covered by `Numeric_food_outside_the_known_values_is_rejected_with_an_error_code`.

## Cost

One dependency (`FluentValidation.DependencyInjectionExtensions`, Apache-2.0, pinned in `Directory.Packages.props`) and a ~30-line filter. Re-check the license before major upgrades — other .NET libraries (e.g. FluentAssertions v8) moved to commercial licenses.
