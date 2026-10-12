# Request limits: reads, photo files and body size

**Decided:** 2026-10-12, from a security review (fixes 3 and 5 of its list).

The site runs on one replica at 0.25 vCPU against DocumentDB's free tier (`hosting.md`). Until now only writes and wrong admin keys were limited, so a single script looping anonymous reads could take the site down for everyone; the Azure budget only emails.

## Per-visitor limits

Every limit is per address, a one-minute fixed window, in memory (so one replica — `hosting.md`), keyed on the visitor's address behind the ingress (`visitor-address.md`).

| Policy | Covers | Default | Setting |
|---|---|---|---|
| `writes` | the `/api/king` writes group | 20 | `RateLimiting:WritesPerMinute` |
| `reads` | every other `/api/king` route (status, history, heat, spots, map, posting, the photo list) | 120 | `RateLimiting:ReadsPerMinute` |
| `photo-files` | `/api/king/photos/{id}/full` and `/thumb` | 600 | `RateLimiting:PhotoFilesPerMinute` |
| `admin` | `/api/admin`, only requests without the right key | 10 | `RateLimiting:AdminPerMinute` |

- **Why 120 reads:** the page polls nothing (the only timer re-renders "5 minutes ago"), and a screen loads a handful of reads, so 120 is twenty full reloads a minute.
- **Why photo files have their own policy:** one page of `/photos` is 50 thumbnails, and "Show older" adds 50 more; sharing the reads' 120 would lock out a neighbor scrolling photos. Files are cached privately for an hour, so going back costs nothing.
- **The innermost policy replaces the outer one.** `reads` is on the `/api/king` group; the writes group and the two file endpoints carry their own, and those replace it rather than adding to it. That's why a write counts only against `writes` (tested: `Writes_count_only_against_the_write_limit`).
- **Shared addresses:** visitors behind one carrier's NAT share a bucket, as they already did for writes. At a street's traffic that's unlikely to bite; if it does, raise the setting.
- Static files, `/health` and `/alive` aren't limited: they're cheap, and the ingress probes them.

## One read for a page of photos

`PhotoEndpoints.PhotoViews` used to look up each photo's entry one by one, so `/api/king/photos?limit=100` cost 100+ database reads, anonymously. `IKingEventStore.FindManyAsync` reads them all at once. Like `FindAsync`, it doesn't leave out hidden entries: `/admin`'s hidden photos are described through the same code, and their entries may be hidden.

## Body size

Kestrel's default allows about 30 MB per request body. Now every body is capped at **64 KB** (`Program.cs`), far above the largest JSON request (a merge's list of place ids). The two photo uploads raise the cap for themselves through endpoint metadata (`photos.md`).

The test server enforces neither limit, so `SecurityHeadersTests` checks the configuration, and it was checked by hand against Kestrel in Production mode (2026-10-12): a 100 kB sighting → **413**, a normal sighting → 201, a 194 kB photo upload got past the cap and through validation (it then failed only on the local storage emulator's connection string), and a 5 MB upload → 413.
