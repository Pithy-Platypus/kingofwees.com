# frontend

- **Every coordinate leaves the browser through `kingApi` (`src/king/api.ts`), which rounds it with `roundToBlock`.** A new request that carries a location rounds there too, in the body, never a URL. Don't send GPS fixes or map taps any other way: the server rounds again, but only as a backstop — the precise fix must not reach the network, server logs or telemetry at all.

Why → `docs/patterns/location-privacy.md`.
