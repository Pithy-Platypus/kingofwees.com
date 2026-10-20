# Security headers: what the page may load

**Decided:** 2026-10-12, from a security review (Wallie asked for fixes 2, 3 and 5 of its list).

## Why

The admin key is kept in `localStorage` (`admin-key.md`), so any script running on the page can read it. Until now "only the page's own scripts run" was a habit: nothing would have stopped an injected script, a compromised package pulling in a remote one, or a careless embed. A Content-Security-Policy makes the browser enforce it. The site also had no HSTS, so a first visit typed as `kingofwees.com` on hostile Wi-Fi could be held on HTTP; and nothing stopped another site framing `/admin` to trick a click on "Hide".

## What every response carries (`source/KingOfWees.Server/SecurityHeaders.cs`)

| Header | Value | Why this value |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` | Everything from the site itself. `data:` because the build inlines six small font subsets and several icons (counted in the built CSS); `blob:` for a picked photo's preview; the tile host for the map. No `'unsafe-inline'` or `'unsafe-eval'`: the built `index.html` has no inline script or style, and no bundle calls `eval` or `new Function`. Style attributes set from script (Leaflet, React's `style`) go through the CSSOM, which `style-src` doesn't block |
| `Strict-Transport-Security` | `max-age=31536000` | A year. No `includeSubDomains`: other names under the domain live at Cloudflare and aren't ours to promise HTTPS for. No `preload` (hard to undo). Sent over plain HTTP too: behind the ingress every request reaches the app as HTTP, and browsers ignore the header unless it arrives over HTTPS |
| `X-Content-Type-Options` | `nosniff` | Everywhere now (it was on photo files only) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | The browsers' default, stated. **Never `no-referrer`:** OpenStreetMap's tile usage policy requires a Referer naming the site, and tiles may be refused without one |
| `Cross-Origin-Resource-Policy` | `same-origin` | Added 2026-10-19 (second security review). Another site can't load the site's files into its own page — King's photos in its `<img>` (hotlinking), a script or a JSON response read as a script. The site's own pages load everything from their own origin, so nothing of theirs is refused; `kingofwees.com` and `www.` each load from themselves. It doesn't touch navigation: opening a photo's link still works. Not `same-site`: no other name under the domain needs the files |
| `X-Robots-Tag` | `noindex` | Added 2026-10-20 (Wallie): the site stays out of search engines — kids post nicknames and the history shows where King goes. `robots.txt` (`frontend/public/`) lets crawlers read the pages, keeping them only out of `/api/`, because a crawler blocked by `Disallow: /` never sees the noindex, and a search engine can still list an address it only saw linked elsewhere. `/admin` isn't named there: it isn't linked anywhere, and naming it in a public file would advertise it. |

Kestrel no longer sends `Server: Kestrel`.

The headers are added in `Response.OnStarting`, not at the start of the request: the exception handler clears the response headers before writing a 500, and headers set earlier would be lost on exactly the responses that come from something going wrong.

## Only production sends it

The policy comes from the ASP.NET server. In local development and in the E2E run, pages come from the Vite dev server, which sends no CSP. So a new external origin — a script, stylesheet, font, image host, or a `fetch` to another site — works locally and in every test, then is silently blocked in production. That is the rule in `source/frontend/CLAUDE.md`.

## How it was checked (2026-10-12)

The production build (`frontend/dist`) served by the server in Production mode against throwaway Mongo and Azurite containers, loaded in headless Chromium (Playwright) on `/`, `/history`, `/photos`, `/about`, `/privacy` and `/admin`: no CSP violations, no console errors, fonts loaded, four OpenStreetMap tiles loaded. The checker was proved able to see a violation: an inline script added to the page didn't run and was reported. `SecurityHeadersTests` pin the exact values on a page, a deep link, an API response and the API's 404.

## Rejected

- **Nonces or hashes** for inline scripts: there are none to allow.
- **`Content-Security-Policy-Report-Only` first:** the policy was checked against the real build before it shipped, and reports need an endpoint to collect them.
- **`X-Frame-Options`:** `frame-ancestors 'none'` covers every browser that runs this site's JavaScript.
- **`Permissions-Policy`:** nothing to remove without testing camera and location prompts on phones; not worth it for this change.
