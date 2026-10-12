# frontend

- **Every coordinate leaves the browser through `kingApi` (`src/king/api.ts`), which rounds it with `roundToBlock`.** A new request that carries a location rounds there too, in the body, never a URL. Don't send GPS fixes or map taps any other way: the server rounds again, but only as a backstop — the precise fix must not reach the network, server logs or telemetry at all.
- **Distances shown to people are US customary — feet, then miles — never metres and never taken from the locale.** Use `imperial()` via `describeCell` in `src/king/heat.ts`; `intl.formatNumber(…, { unit: 'meter' })` renders fine and is wrong for this US site (until people can choose their own formats).
- **The admin key leaves the browser only as an `Authorization: Bearer` header, through `adminApi` (`src/king/admin.ts`).** A call that puts it in a URL works and leaks it into server logs, traces and browser history.
- **A new button-like class joins the shared `@apply btn` rule at the top of `@layer components` in `src/index.css`, and applies only its own variant and sizes.** `@apply btn` in the class's own rule works and looks identical, and copies daisyUI's whole button (~7 kB) into the stylesheet again; nothing fails or warns.
- **After changing any test, run StrykerJS with `--force`** (scope it with `--mutate <file>`). With the command runner the whole suite is one "test", so incremental mode reuses old results and prints a plausible score for code and tests it never re-ran.

Why → `docs/patterns/location-privacy.md` (coordinates), `docs/patterns/display-units.md` (distances), `docs/patterns/admin-key.md` (admin key), `docs/patterns/mutation-testing.md` (StrykerJS incremental), `docs/patterns/site-size.md` (shared button rule).
