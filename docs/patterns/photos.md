# Photos

**Decided:** 2026-10-11, Slice 6 (`PLAN.md` → Slice 6 has the choices and their reasons; this file keeps the ones behind rules).

## The server strips metadata, even though the browser already does

Phone photos carry the exact GPS point (and often the time and the phone's make) in EXIF and XMP. That point would bypass block rounding (`location-privacy.md`) — a photo of King on a porch would publish the porch to a few metres. The browser re-encodes every photo through a canvas, which writes none of it; but the upload endpoints are public, and anyone can post bytes straight to them. So the server keeps only what `JpegMetadata.Strip` returns: it walks the JPEG's segments, drops APP1–APP15 (EXIF, XMP, ICC profiles, maker notes) and comments, keeps everything else byte for byte, and refuses anything that isn't a whole JPEG. No image library: nothing is decoded, so there's no decoder to attack and no dependency to keep patched. A new path that stores uploaded bytes without it works, looks right in every screenshot, and leaks the location.

## Form records bind through properties

Minimal APIs bind a `[FromForm]` record's constructor parameters as **required**, nullable or not: a form without `reporterName` failed binding with a bare 400 — no error codes for the page to translate — and before the endpoint filters ran, so a request from outside the US got that 400 instead of the US check's 403 (`PostingCountryTests` caught it). With `init` properties a missing field binds as null and FluentValidation reports it with a code.

## Size limits

The browser sends a ~1600 px photo and a thumbnail, so limits are 1 MB and 100 KB per file (validator: `photo.tooLarge`), and the whole request may be at most both plus 64 KB. That request limit is endpoint metadata (`RequestSizeLimitAttribute` for Kestrel, plus the form reader's multipart limit): Kestrel answers **413 before reading** a larger body (checked by hand: 5 MB → 413), so an oversized upload never fills the server's memory. The test server doesn't enforce request limits, so a test checks that both upload endpoints carry them.

## Order of writes

Adding: both files first, the record last. Deleting: the record first, the files last. Either way a record never points at missing files; at worst a failure leaves an orphaned file nobody can reach, which costs a fraction of a cent.
