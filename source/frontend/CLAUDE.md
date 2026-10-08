# frontend

- **Every coordinate leaves the browser through `kingApi` (`src/king/api.ts`), which rounds it with `roundToBlock`.** A new request that carries a location rounds there too, in the body, never a URL. Don't send GPS fixes or map taps any other way: the server rounds again, but only as a backstop — the precise fix must not reach the network, server logs or telemetry at all.
- **Distances shown to people are US customary — feet, then miles — never metres and never taken from the locale.** Use `imperial()` via `describeCell` in `src/king/heat.ts`; `intl.formatNumber(…, { unit: 'meter' })` renders fine and is wrong for this US site (until people can choose their own formats).

Why → `docs/patterns/location-privacy.md` (coordinates), `docs/patterns/display-units.md` (distances).
