# Posting only from the US

**Decided:** 2026-10-11, Slice 4b, with Wallie.

## The choice

Logging a feeding or sighting, adding a place, undo and rename (every `/api/king` write) are refused with a 403 (`posting.outsideUs`) for a visitor whose address is known to be outside the US. Reading stays open everywhere, and `/admin` isn't restricted: the key is 256 random bits, wrong keys are limited and logged, and a caretaker travelling abroad must still be able to moderate. Home asks `GET /api/king/posting` and shows a message instead of the two buttons.

Recommended against first, and built at Wallie's request: there was no spam yet, and a US address isn't "local" — anyone in the US passes, and anyone with a VPN set to the US does too. So the message says what's true ("can only be logged from the United States") rather than "only local neighbors".

## Where the country comes from

**DB-IP IP-to-Country Lite**, an MMDB file read in the process with **MaxMind.Db** (Apache-2.0, no dependencies). Checked before building:

- Licence CC BY 4.0: redistribution allowed, so it can ship inside our public image; DB-IP asks for "IP Geolocation by DB-IP" linked on pages that use it — the site footer.
- Same layout as MaxMind's (`country.iso_code`), but the metadata's database type is `DBIP-Country-Lite`, so code that checks for a MaxMind type name breaks; ours never checks it.
- Monthly, 8.3 MB; `infra/deploy.sh` downloads the current month (last month's early in a month) into each image, so the data is as fresh as the last deploy. Memory-mapped, it costs little next to the app's ~100 MiB.
- Both it and MaxMind's test database resolve IPv4 addresses in IPv6 form (`::ffff:a.b.c.d`) themselves (checked), so the code doesn't convert them.

Rejected: Cloudflare's country header (needs Cloudflare's proxy, which breaks Container Apps' free managed certificate); Azure Front Door's geo-filter ($35+ a month, over budget); MaxMind GeoLite2 (its licence doesn't allow shipping it in a public image); an online lookup service (sends every visitor's address to a third party).

## Things that look harmless and aren't

- **Putting the check in the `CanPost` policy.** A failed policy for an anonymous visitor becomes a 401 challenge, not a 403 — the page would treat it as something else, and the admin sign-in audit (an authorization result handler) runs on it. It's an endpoint filter on the writes group instead.
- **Refusing unknown addresses.** Private addresses, loopback and gaps in the database have no country; refusing them would lock out neighbors on odd networks and every local and test run. Unknown is allowed.
- **A configured path that doesn't load.** The server refuses to start (options validated on start) rather than quietly opening posting to everyone; `/api/king/posting` and the writes would otherwise look fine.
- **The address.** It's `Connection.RemoteIpAddress` after `UseForwardedHeaders` (`visitor-address.md`); without `King:Proxy:TrustForwardedFor` behind the ingress every visitor would look like the proxy, which has no country, so everyone would be allowed.
- **Telemetry.** Refusals are counted (`king.posting.refused`) with no country and no address.
