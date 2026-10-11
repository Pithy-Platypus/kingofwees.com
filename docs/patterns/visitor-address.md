# The visitor's address behind Container Apps

**Decided:** 2026-10-09, Slice 5 step 3 (go-live).

## The problem

Both rate limits — writes (20 a minute) and wrong admin keys (10 a minute) — are per address, keyed on `Connection.RemoteIpAddress`. Behind Azure Container Apps' ingress every connection comes from the proxy, so every visitor would share one bucket: one busy neighbor, or one spammer, would lock everyone else out. Locally there's no proxy, so everything looks fine until it's deployed.

## What the ingress sends

Microsoft's ingress docs, on `X-Forwarded-For`: "If specified in initial request, it is appended to. Only the rightmost IP is provided by Azure Container Apps. Any other values must be validated by the user to prevent IP spoofing." The proxy's own address isn't documented as fixed, so there's no list of known proxies to trust.

## The choice

With `King:Proxy:TrustForwardedFor` set (only in the Container Apps deployment), `UseForwardedHeaders` runs first in the pipeline with `ForwardLimit = 1` and no known-proxy list: it takes the rightmost entry — the one the ingress added — as the visitor's address, from any connecting address. That's safe only because the container is reachable through the ingress alone. Everything to the left of it is whatever the visitor typed and is ignored, so sending a made-up `X-Forwarded-For` doesn't buy a fresh bucket.

## Things that look harmless and aren't

- **Turning the setting on where Kestrel is reachable directly** (locally, a VM without a proxy) lets any client choose its own address and skip the limits. Off is the default.
- **Trusting more than one hop** (`ForwardLimit` above 1 or `null`) lets the visitor's own entries through — the spoofing the docs warn about.
- **Moving `UseForwardedHeaders` after `UseRateLimiter`**: the limiter partitions on the proxy's address again.
- **Telemetry**: the address the middleware sets is the visitor's, so it must stay out of traces like any other (`TelemetryPrivacyTests`, `PersonalDataScrubber`).

Each of these was tried as a deliberate break; `ForwardedAddressTests` and `TelemetryPrivacyTests` catch all of them.

## Rejected

- **Trusting `X-Forwarded-For` everywhere, always** — spoofable wherever no proxy overwrites it.
- **A list of the ingress's addresses** — not documented as fixed on the Consumption plan; a wrong list would silently put everyone back in one bucket.
