# Photos

**Decided:** 2026-10-11, Slice 6 (`PLAN.md` → Slice 6 has the choices and their reasons; this file keeps the ones behind rules).

## The server strips metadata, even though the browser already does

Phone photos carry the exact GPS point (and often the time and the phone's make) in EXIF and XMP. That point would bypass block rounding (`location-privacy.md`) — a photo of King on a porch would publish the porch to a few metres. The browser re-encodes every photo through a canvas, which writes none of it; but the upload endpoints are public, and anyone can post bytes straight to them. So the server keeps only what `JpegMetadata.Strip` returns: it walks the JPEG's segments, drops APP1–APP15 (EXIF, XMP, ICC profiles, maker notes) and comments, keeps everything else byte for byte, and refuses anything that isn't a whole JPEG. No image library: nothing is decoded, so there's no decoder to attack and no dependency to keep patched. A new path that stores uploaded bytes without it works, looks right in every screenshot, and leaks the location.

## Form records bind through properties

Minimal APIs bind a `[FromForm]` record's constructor parameters as **required**, nullable or not: a form without `reporterName` failed binding with a bare 400 — no error codes for the page to translate — and before the endpoint filters ran, so a request from outside the US got that 400 instead of the US check's 403 (`PostingCountryTests` caught it). With `init` properties a missing field binds as null and FluentValidation reports it with a code.

## Size limits

The browser sends a ~1600 px photo and a thumbnail, so limits are 1 MB and 100 KB per file (validator: `photo.tooLarge`), and the whole request may be at most both plus 64 KB. That request limit is endpoint metadata (`RequestSizeLimitAttribute` for Kestrel, plus the form reader's multipart limit): Kestrel answers **413 before reading** a larger body (checked by hand: 5 MB → 413), so an oversized upload never fills the server's memory. The test server doesn't enforce request limits, so a test checks that both upload endpoints carry them.

## Serving: private, an hour at most

Files are served by the server only while the photo is visible (`FindVisibleAsync`: not hidden itself, not on a hidden entry, not from a hidden device), so hiding works the moment it's saved for anyone who hasn't loaded the photo yet. The files never change, which would normally earn a long `immutable` cache — but then a hidden photo would stay in every browser that had shown it. `Cache-Control: private, max-age=3600` bounds that to an hour, and `private` keeps it out of any shared cache: none sits in front today (Cloudflare is DNS only), but turning the proxy on later would otherwise keep serving a hidden photo from Cloudflare's edge. `nosniff` because the bytes come from the public.

## Order of writes

Adding: both files first, the record last. Deleting: the record first, the files last. Either way a record never points at missing files; at worst a failure leaves an orphaned file nobody can reach, which costs a fraction of a cent.

## In the browser: shrink, then post the entry before the photo

The browser shrinks every picked photo before sending it (`src/king/photo.ts`): drawn through a canvas to at most 1600 px on the longer side, plus a 400 px thumbnail, as JPEG at quality 0.85, stepping down (0.7, 0.55, 0.4) until each fits the server's limit; a photo that still doesn't fit, or that the browser can't decode (a HEIC file in a desktop browser), is refused on the spot with "Couldn't use that photo." The re-encode is also what drops the EXIF block the first time. Current browsers apply the EXIF orientation when drawing an `<img>`, so portrait phone photos should stay upright — not tested here (the e2e photo has no EXIF); step 8 checks it on a phone. jsdom has no decoder or canvas, so the unit tests cover only the sizing and quality steps; the e2e flow draws a 4032×3024 photo in the page and checks the stored files are 1600×1200 and 400×300 (checked by changing the edge to 2000: caught).

The entry is posted first and shown at once; its photo follows. A failed upload says the entry is saved and offers Retry with the same files, so a bad connection never costs the entry. A 409 means the 10-minute window closed ("too late", no Retry). Undo stays off while a photo is on its way, so the two requests never race (an upload that lost the race would get a 404 — no stray photo — but the screen would say the photo failed on an entry that's gone).
