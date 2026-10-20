# Photos

**Decided:** 2026-10-11, Slice 6 (`PLAN.md` → Slice 6 has the choices and their reasons; this file keeps the ones behind rules).

## Through the server, not straight to storage

Uploads and downloads both go through the app rather than straight to Blob Storage with signed links. The app is the only place that knows what may be posted (US only, the write limit, one photo per entry, the undo window) and what may be seen (hidden photos, hidden entries, hidden posters): a signed upload link would skip the first, and a public container would serve a hidden photo to anyone who kept its address. The cost is the bytes passing through a 0.25 vCPU app — measured below, it holds.

## Hidden, never deleted, by an admin

Admins hide photos — on their own, with their entry, or with everything from a poster — and can show them again; there is no admin delete. A provider that finds apparent child sexual abuse material must report it to NCMEC and keep it for a year (18 U.S.C. § 2258A(h)); an admin's delete button could destroy exactly that. Hidden photos are never served and never shown on `/admin` (listed in words only, so an unlawful one isn't displayed again); the reason the admin gave when hiding — and when, and who — is how a later admin tells them apart (`admin-key.md`). The poster's own undo, within 10 minutes, does delete — the files then sit in the storage account's 30-day soft delete. A "delete for good" for ordinary cases (rude, off-topic) is in `PLAN.md` → Later. The Privacy page says hidden photos are kept.

## The server strips metadata, even though the browser already does

Phone photos carry the exact GPS point (and often the time and the phone's make) in EXIF and XMP. That point would bypass block rounding (`location-privacy.md`) — a photo of King on a porch would publish the porch to a few metres. The browser re-encodes every photo through a canvas, which writes none of it; but the upload endpoints are public, and anyone can post bytes straight to them. So the server keeps only what `JpegMetadata.Strip` returns: it walks the JPEG's segments, drops APP1–APP15 (EXIF, XMP, ICC profiles, maker notes) and comments, keeps everything else byte for byte, and refuses anything that isn't a whole JPEG. No image library: nothing is decoded, so there's no decoder to attack and no dependency to keep patched. A new path that stores uploaded bytes without it works, looks right in every screenshot, and leaks the location.

## Form records bind through properties

Minimal APIs bind a `[FromForm]` record's constructor parameters as **required**, nullable or not: a form without `reporterName` failed binding with a bare 400 — no error codes for the page to translate — and before the endpoint filters ran, so a request from outside the US got that 400 instead of the US check's 403 (`PostingCountryTests` caught it). With `init` properties a missing field binds as null and FluentValidation reports it with a code.

## The device key in a header, never a form field

**Decided:** 2026-10-19, from the second security review. A shared photo used to carry its device key as a form field. A `multipart/form-data` POST is one any web page can make a visitor's browser send to another site without asking first, so a hostile page could have every US visitor's browser upload its pictures: past the US-only check and spread over many addresses' write limits. The response stays unreadable to that page, but the photo is posted. Both uploads now take the key from `X-Reporter-Key`, as undo, rename and delete do: a custom header makes the browser send a preflight first, and with no CORS policy on the server the browser stops there. The JSON writes were never exposed this way: they need `Content-Type: application/json`, which also forces a preflight.

Rejected: checking `Origin` or `Sec-Fetch-Site` on writes — more code, and a rule for the clients that send neither; accepting both places for a while — that keeps the hole open. A page opened before the change and never reloaded can't share a photo until it is (pages are `no-cache`, so a reload fetches the new script).

## Size limits

The browser sends a ~1600 px photo and a thumbnail, so limits are 1 MB and 100 KB per file (validator: `photo.tooLarge`), and the whole request may be at most both plus 64 KB. Every other request body is capped at 64 KB (`request-limits.md`); the uploads' limit is endpoint metadata that raises it (`RequestSizeLimitAttribute` for Kestrel, plus the form reader's multipart limit): Kestrel answers **413 before reading** a larger body (checked by hand: 5 MB → 413), so an oversized upload never fills the server's memory. The test server doesn't enforce request limits, so a test checks that both upload endpoints carry them.

## Serving: private, an hour at most

Files are served by the server only while the photo is visible (`FindVisibleAsync`: not hidden itself, not on a hidden entry, not from a hidden device), so hiding works the moment it's saved for anyone who hasn't loaded the photo yet. The files never change, which would normally earn a long `immutable` cache — but then a hidden photo would stay in every browser that had shown it. `Cache-Control: private, max-age=3600` bounds that to an hour, and `private` keeps it out of any shared cache: none sits in front today (Cloudflare is DNS only), but turning the proxy on later would otherwise keep serving a hidden photo from Cloudflare's edge. `nosniff` because the bytes come from the public.

## Order of writes

Adding: both files first, the record last. Deleting: the record first, the files last. Either way a record never points at missing files; at worst a failure leaves an orphaned file nobody can reach, which costs a fraction of a cent.

## In the browser: shrink, then post the entry before the photo

The browser shrinks every picked photo before sending it (`src/king/photo.ts`): drawn through a canvas to at most 1600 px on the longer side, plus a 400 px thumbnail, as JPEG at quality 0.85, stepping down (0.7, 0.55, 0.4) until each fits the server's limit; a photo that still doesn't fit, or that the browser can't decode (a HEIC file in a desktop browser), is refused on the spot with "Couldn't use that photo." The re-encode is also what drops the EXIF block the first time. Current browsers apply the EXIF orientation when drawing an `<img>`, so portrait phone photos should stay upright — not tested here (the e2e photo has no EXIF); step 8 checks it on a phone. jsdom has no decoder or canvas, so the unit tests cover only the sizing and quality steps; the e2e flow draws a 4032×3024 photo in the page and checks the stored files are 1600×1200 and 400×300 (checked by changing the edge to 2000: caught).

The entry is posted first and shown at once; its photo follows. A failed upload says the entry is saved and offers Retry with the same files, so a bad connection never costs the entry. A 409 means the 10-minute window closed ("too late", no Retry). Undo stays off while a photo is on its way, so the two requests never race (an upload that lost the race would get a 404 — no stray photo — but the screen would say the photo failed on an entry that's gone).

## Removing one's own shared photo

For 10 minutes after sharing, `/photos` offers **Remove** on that photo, in this browser only, asked in place (`undo.md`); it calls `DELETE /api/king/photos/{id}` with `X-Reporter-Key`, which deletes the record and both files (recoverable from storage's soft delete for 30 days). A photo on an entry goes only with its entry.

## Showing photos

Every photo is described by how it was added, like its history line ("Photo from a sighting by Sarah near Porch, Oct 8, 2026, 4:12 PM"; "Photo shared by Kael on Oct 8, 2026"). The date **always carries the year**: a shared photo can be months old, and "Oct 8" alone would read as this year. The same text is the image's `title` as well as its `alt`: browsers never show alt text on hover (Wallie's manual test found hovering showed nothing), and a title equal to the accessible name isn't read twice. Touch screens have no hover, and captions were declined, so phones show no description.

A thumbnail opens the full-size JPEG as a plain link, not an in-page viewer: it works without JavaScript and the browser's own viewer zooms. `/photos` loads on demand like `/admin`, keeping the visitor bundle under Vite's warning. Home keeps the status it loaded at start, so the photos page asks the app to reload it after a share or a hide; otherwise Home shows the old avatar (or a hidden photo) until a reload — the e2e flow caught this.

## Warm before the first visitor (2026-10-20)

A new revision's first photo-storage call waits for the app's managed-identity token (`GET /msi/token`, 1.9–3.2 s) and a connection, and every thumbnail on the first page queues behind it: over 30 days, blob downloads in a revision's first 3 minutes had a p95 of 4.2 s against 0.35 s later, and 47 of the 53 downloads visitors gave up on (499) fell there. Mongo didn't have the problem: the `/health` readiness probe already touches it.

`PhotoStorageWarmUp` (an `IHostedService`) calls `IPhotoBlobStore.WarmUpAsync` at startup — in Azure, one page of at most one blob name, a 200 with the app's own read access. Hosted services finish `StartAsync` before Kestrel takes requests (checked with a 5 s `StartAsync`: "Now listening" came after it), so the readiness probe, and traffic, wait for the warm-up. It's never fatal, for the same reason photo storage stays out of `/health`: every error is caught and logged as a warning, and it gives up after 10 s even if the call ignores its token (`PhotoStorageWarmUpTests`).

## Measured (Slice 6 step 8)

The production image in Docker, capped at 0.25 CPU / 512 MiB as on Container Apps, with Mongo, Azurite and the Aspire dashboard (OpenTelemetry export on) beside it, on Wallie's Mac (arm64; Container Apps runs amd64). **Neighborhood pace** — 30 sightings each with a 610 KB photo, 2–5 s apart, with status and photos-page reads: all 201, upload p50 53 ms / p95 162 ms, CPU mean 5.6%. **Stress** — 100 uploads of an 874 KB photo 10 at a time plus 300 full-size reads 10 at a time: all succeeded, upload p50 581 ms / p95 930 ms, reads p50 92 ms / p95 896 ms, CPU pinned at the 25% cap. **Memory** rose with each burst (188 → 252 → 276 → 317 MiB) and then levelled off: two more rounds of 300 uploads peaked at 334 then 329 MiB, settling near 310 MiB, flat while idle — the garbage collector's steady state, not a leak; never OOM-killed. A fresh start of this image and of the last commit before photos (`7c13379`) idle at 47 and 44 MiB and reach 65 MiB under the same light traffic, so photos and the package refresh didn't raise the baseline. Unexplained: the first run's server idled at 173 MiB before any upload (serving the main JavaScript three times adds only 4 MiB). **Verdict:** 0.25 vCPU / 0.5 GiB holds, with ~180 MiB to spare at the plateau; uploads are CPU-bound, so a burst of many at once is slow (about a second each) but succeeds.
