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
- **Cost:** each public read also reads the hidden-device list (one small query). A street's moderation list stays tiny; if it ever doesn't, cache it.

## In the browser (Slice 4 step 4)

- **The key is kept in `localStorage` on the admin's own device**, so moderating doesn't mean pasting it every visit. Anything running on the page could read it, so the site keeps loading no third-party scripts (it loads none today). **Sign out on this device** forgets it; a rotated key is forgotten the first time the server answers 401.
- **A pasted hash is caught before any request** (64 hex characters; a key is 43 URL-safe Base64 ones). That exact mix-up happened in the first manual test, and the server's answer — a 401 — can't say why. Checking first also saves one of the ten tries a minute.
- **The tool prints KEY then HASH under plain labels**, with nothing between them, for the same reason.
- **Hiding is asked in place** ("Hide 14 entries and 2 spots from Sarah, including anything they post later?"), never with a browser dialog, and the counts come from the server before anything is hidden.
