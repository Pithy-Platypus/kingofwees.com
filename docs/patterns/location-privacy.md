# Location privacy: round to ~a block, in the browser and on the server

**Decided:** 2026-10-08, before any location is stored (Phase 2b step 2).

## The risk

Every entry is public: anyone can read `/api/king/status`, and the repo is public. A phone's GPS fix is good to a few meters — enough to say *which house*. Feeding spots are mostly porches and front steps, so a precise point on a feeding is, in practice, where a neighbor (often a kid) lives. A sighting logged "I'm near him now" is where that person is standing right now.

## The rule

Coordinates are rounded to **3 decimal places** of a degree before they are stored:

| Decimals | North–south | East–west (at 45°) | Means |
|---|---|---|---|
| 2 | ~1.1 km | ~790 m | A whole neighborhood — a heat map of one street would be one dot |
| **3** | **~110 m** | **~80 m** | **About a block — enough to see where King hangs out** |
| 4 | ~11 m | ~8 m | One house |

Rounding happens **twice**:

- **In the browser** (`roundToBlock`, `source/frontend/src/king/location.ts`), so the precise fix never leaves the device — not in transit, not in server request logs, not in telemetry.
- **On the server** (`GeoPoint`, `source/KingOfWees.Server/King/GeoPoint.cs`), because the API is public: an old app version, a script or `curl` can send any precision. `GeoPoint` rounds whenever a coordinate is set — constructor, `with`, JSON binding, Mongo reads, configuration binding — so nobody has to remember to call anything. Its coordinates are also `[JsonRequired]`: JSON would otherwise read a missing one as `0`, a real place off the coast of Africa.

Both round half away from zero, so they agree exactly. Rounding an already-rounded value changes nothing (tested on both sides).

## Rejected alternatives

- **Random jitter** (add ±50 m noise). Repeated entries from the same porch average back to the true point — the more someone feeds King, the more precisely they're located. It also smears the heat map. Rounding snaps every entry from one porch to the same grid point, which is stable and reveals nothing more over time.
- **Server-only rounding.** Simpler, but the precise point would still cross the network and could land in request logs or traces before rounding.
- **Client-only rounding.** The API is open; the server can't trust a client to have done it.
- **Storing precise, rounding on read.** A database leak or a future endpoint that forgets to round would expose everything ever logged.

## Related

- Coordinates travel in request **bodies**, never URLs: query strings appear in logs and browser history (the server also strips `url.query` from telemetry — see `PersonalDataScrubber`).
- The heat map (`/api/king/heat`) groups on the stored, already-rounded values by exact equality: a block is the finest thing it can draw, and there is no precision left to recover. The page then folds blocks near a feeding spot into that spot — coarser still.
- The map center (`King:Map:Center`) is kept out of the public repo (user-secrets / environment). It is still sent to every visitor so the map can open there — keeping it out of git avoids it being searchable in the repo history forever, not hiding it from visitors.
- Map tiles load from OpenStreetMap, which sees the visitor's IP address and roughly what area they're viewing; the Privacy page says so.
