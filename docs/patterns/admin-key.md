# Admin: a key held as a hash, and hiding instead of deleting

**Decided:** 2026-10-09, Slice 4 step 1 (admin hides spam).

## The choice

One admin key, checked as `Authorization: Bearer <key>`. Rejected for now: "Sign in with Google" limited to a list of emails. It's better once several neighbors moderate (one person's access can be removed), but it needs a Google OAuth client, a new package, and redirect addresses that depend on the still-undecided hosting. The `Admin` policy is the one place that would change.

## Why the server holds only the hash

Configuration leaks more easily than a password manager: a hosting dashboard, a support screenshot, an `.env` copied around. With only the SHA-256 hash configured, what leaks there can't be used. A 256-bit random key needs no slow password hash (bcrypt and the like protect *guessable* passwords); SHA-256 is enough, and the comparison is constant-time (`CryptographicOperations.FixedTimeEquals`).

## Why a tool makes the hash

Hand-made hashes go wrong silently: `echo "$key" | shasum` hashes the key **plus a newline**, so the right key is refused forever. `source/tools/new-admin-key.cs` references the server project and calls the server's own `AdminKeyHasher`, so the tool and the server can't disagree. A configured value that isn't 64 hex characters (the key pasted where its hash belongs) stops the server starting, so it shows at deploy.

## Why "no hash" means 404, not 401

A missing setting must not leave admin open, and shouldn't advertise it either. Authorization runs before endpoint filters, so a filter can't turn the 401 into a 404; instead the `/api/admin` group isn't mapped at all, and its paths fall through to the API's 404 fallback. Configuration only changes on restart, so mapping once at startup is enough.

## Things that look harmless and aren't

- **The admin handler is the default scheme.** ASP.NET Core makes a lone authentication scheme the default, so `AdminKeyHandler` sees every request, public ones included. It returns "no result" when no hash is configured, otherwise it would throw on every request carrying a `Bearer` header.
- **The rate limit limits only requests without the right key** (10 a minute per IP by default) — that is what makes guessing slow, on top of the key's size. It runs before authorization, so it checks the key itself (`AdminKeyHandler.CarriesTheKey`). It first counted every admin request; in Wallie's first manual test the real admin hit it within a minute (sign-in, two `/admin` visits — each loading two lists, twice under dev `StrictMode` — and two hides), and the page could only say "Couldn't hide it". Exempting the right key costs guessing nothing: a guess that's right was never going to be slowed anyway.
- **The key travels in a header**, never a URL, so it stays out of request logs and browser history. Traces don't record it (`TelemetryPrivacyTests`).

## Hiding: per entry or per device, never deleted

**Decided:** 2026-10-09 (Slice 4 step 2), with Wallie.

- **Hidden, not deleted**, so a mis-tap can be restored. Removing an entry for good, on a privacy request, is a different job and not built.
- **Per device as well as per entry.** Spam comes in bursts from one browser. Hiding the device (its `ReporterKey`) hides the burst in one tap — and its **later posts too**, so the spammer can't burst again from the same browser and leave the admin hiding entry after entry. The spammer still sees "Logged!", so it isn't obvious they're blocked. Clearing browser data gives a new key; if that keeps happening, the next step is the `CanPost` seam (posting key or accounts). Hiding one entry exists for a regular neighbor's one bad post, which shouldn't take their whole history with it.
- **Filtering lives in the stores**, not the endpoints: status, history, heat and spots all read through a handful of store methods, and an endpoint can't forget a filter it never sees. `FindAsync` stays unfiltered — undo, rename and history cursors need to find hidden entries.
- **The device key is never shown, admins included.** A hidden device is a record with its own id; that id is what admins list and restore.
- **`Ne(Hidden, true)`, not `Eq(Hidden, false)`** — the same trap as `SawKing`: documents from before the field have none, and `Eq(false)` would hide all of them. Mongo contract tests with pre-field documents catch it.
- **Photos (Slice 6, 2026-10-11)** hide on their own (the entry stays — for an unsuitable picture on a genuine sighting), with their entry, or with their poster; hidden photos also leave with a hidden entry (`Nin(EventId, hidden entries)`). **Never deleted by an admin**: a photo reported to NCMEC must be kept a year (18 U.S.C. § 2258A(h)), and an admin delete could destroy evidence. `/admin` lists hidden photos **in words only** ("Photo on a feeding by Kael at Porch (Oct 8)") — a photo hidden because it was unlawful must not be shown again there — and the files are served only while visible. Recorded as `hidePhoto` / `showPhoto`.
- **Cost:** each public read also reads the hidden-device list (one small query). A street's moderation list stays tiny; if it ever doesn't, cache it.

## In the browser (Slice 4 step 4)

- **The key is kept in `localStorage` on the admin's own device**, so moderating doesn't mean pasting it every visit. Anything running on the page could read it, so the site keeps loading no third-party scripts (it loads none today). **Sign out on this device** forgets it; a rotated key is forgotten the first time the server answers 401.
- **A pasted hash is caught before any request** (64 hex characters; a key is 43 URL-safe Base64 ones). That exact mix-up happened in the first manual test, and the server's answer — a 401 — can't say why. Checking first also saves one of the ten tries a minute.
- **The tool prints KEY then HASH under plain labels**, with nothing between them, for the same reason.
- **Hiding is asked in place** ("Hide 14 entries and 2 spots from Sarah, including anything they post later?"), never with a browser dialog, and the counts come from the server before anything is hidden.

## The audit log (Slice 4 step 8)

**Decided:** 2026-10-11, with Wallie.

- **One shared key plus a typed name**, not a key per admin. The name is typed at sign-in, kept with the key on the device, and sent on every admin request as `X-Admin-Name` (URL-encoded: header values must be ASCII). Anyone with the key can type any name, so a recorded name is a **claim, not proof**; the Activity section on `/admin` says so. One key per admin (or Google sign-in) is what would make names trustworthy; the `Admin` policy is still the one place that would change.
- **What's recorded:** every successful sign-in (`/api/admin/check`, which the page calls only from the sign-in form), every change (hide/show an entry, hide/restore a poster, rename a place), and every **wrong key** on an admin route — each with the time, the visitor address the rate limits use, and the typed name ("no name" when there was none). Reads aren't recorded, nor are refused actions (404, validation). No key at all isn't an attempt. Requests the admin limit refuses (429) aren't checked, so they aren't recorded either — that also bounds how fast wrong keys can fill the log (10 a minute per address).
- **What a record says:** what was touched **in words** — poster name and counts, entry kind and date, place names — never a device key or an entry id. Records hold fields, not sentences, so the page translates them.
- **Where:** recorded in each endpoint after it succeeds (`AdminAudit.RecordAsync`); wrong keys in `AdminSignInAudit`, an authorization result handler, because authorization answers 401 before any endpoint or filter runs.
- **Append-only:** `IAdminLogStore` has no update or delete.
- **Kept a year, then deleted by the database:** a TTL index on `AtUtc` (`expireAfterSeconds` = 365 days). It's created on the first append, not at startup, so the app still starts with the database down. A TTL index silently skips documents whose field isn't a BSON date, so the store keeps `AtUtc` a `DateTime` and a Mongo test checks the stored type. DocumentDB lists TTL as supported (learn.microsoft.com, "MQL compatibility", updated 2026-06-13); the index is tested on local Mongo only — tests never run against the production cluster, and deletion runs on the server's own schedule anyway. The first production backup (2026-10-11) shows the cluster holds it (`AtUtc_1`, 365 days), with a DocumentDB-only option (`storageEngine.enableOrderedIndex`) that plain Mongo refuses — so a restore into plain Mongo loads data only, and the index comes back because the app creates it on each process's first append.
- **Addresses are stored here, and only here.** The Privacy page used to say addresses are never stored; it now says they are kept with admin sign-ins and attempts, and what's changed there, for a year (Wallie's choice over dropping the address or keeping it only for the right key). The typed name and the address still never reach logs or telemetry (`TelemetryPrivacyTests`).

## Merging places (Slice 4 step 9)

**Decided:** 2026-10-11, with Wallie.

- **Deleted, not hidden — no undo** (Wallie's choice over restorable): a merge is for duplicates ("Porch" and "porch"), and the kept place carries every feeding, so nothing is lost but the duplicate's pin.
- **Every feeding moves, hidden ones too.** Feedings store only a `SpotId`; one left behind would point at a place that no longer exists. So `MoveFeedingsAsync`, the per-place counts the confirmation shows (`CountEveryFeedingBySpotAsync`) and `ISpotStore.DeleteAsync` skip the hidden filter on purpose.
- **Feedings move before the places are deleted**, so a failure part-way never leaves a feeding pointing at a deleted place. Not atomic (no multi-document transaction): a feeding logged at a merged place in the instant between the move and the delete would show without a place. Accepted for a street's traffic.
- **The merged places' own names don't count as taken**, so "Porch" + "porch" can become "Porch"; any other place's name, hidden posters' included, still does.
- **A device that remembered a merged-away place** opens the feed screen on "No spot" once (the app offers only places that exist, `App.tsx`); the neighbor taps the kept place and it's remembered again.
- **The admin page loads on demand** (`React.lazy`): step 9 pushed the visitor bundle to 502 kB, past Vite's warning; the admin page is now its own 23 kB file and the visitor bundle 480 kB.
