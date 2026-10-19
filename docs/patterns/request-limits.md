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

## Photo uploads at once, every visitor together

**Decided:** 2026-10-19, from the second security review (Wallie: 4, no queue, a setting). The per-visitor limits bound how often, not how many at a time: each upload is read into memory more than once (the validator strips it to check it's a JPEG, the handler strips it again to store it — a few MB per upload), the app has 0.5 GiB, and 20 uploads a minute from each of a handful of addresses could all be in flight together. So at most **4** uploads run at once across the whole site (`RateLimiting:PhotoUploadsAtOnce`); a fifth gets **429** straight away. Reads, other writes and the photo files are untouched.

- **A global limiter** (`RateLimiterOptions.GlobalLimiter`, in `KingServices`), not an endpoint policy: the innermost endpoint policy *replaces* the outer one (above), so a concurrency policy on the uploads would have dropped them out of the `writes` limit. The global limiter runs before, and as well as, the endpoint's. It applies to endpoints carrying `PhotoUploadEndpoint` metadata, which `WithPhotoUploadLimits` adds — so a new upload endpoint that uses it is covered too.
- **Before the body is read:** the rate limiter middleware runs before the endpoint, and the lease lasts the whole request — reading the form, both strips, storing both files.
- **No queue:** four neighbors uploading in the same second is unlikely on one street, and a queue would add a setting and a waiting state; a refused upload shows the page's usual upload error with Retry.
- **The setting is read at the first upload** (the limiter is made once); a changed value applies after a restart. In Container Apps, changing an environment variable makes a new revision, so it applies as soon as it's set (`infra/README.md` → Settings).
- **Not done:** reading each file once instead of twice. It would mean handing the validator's stripped bytes to the handler through request state; with the limit in place it only shrinks each upload's share, not the bound.
- **Tests** hold uploads while their files are being stored (`PhotoUploadLimitTests`): the test server hands a request to the app only once its whole body has been sent, so holding the body open holds nothing.

## One read for a page of photos

`PhotoEndpoints.PhotoViews` used to look up each photo's entry one by one, so `/api/king/photos?limit=100` cost 100+ database reads, anonymously. `IKingEventStore.FindManyAsync` reads them all at once. Like `FindAsync`, it doesn't leave out hidden entries: `/admin`'s hidden photos are described through the same code, and their entries may be hidden.

## Body size

Kestrel's default allows about 30 MB per request body. Now every body is capped at **64 KB** (`Program.cs`), far above the largest JSON request (a merge's list of place ids). The two photo uploads raise the cap for themselves through endpoint metadata (`photos.md`).

The test server enforces neither limit, so `SecurityHeadersTests` checks the configuration, and it was checked by hand against Kestrel in Production mode (2026-10-12): a 100 kB sighting → **413**, a normal sighting → 201, a 194 kB photo upload got past the cap and through validation (it then failed only on the local storage emulator's connection string), and a 5 MB upload → 413.
