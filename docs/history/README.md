# History

Finished slices of kingofwees.com, moved out of `PLAN.md` on 2026-10-24 with their step tables and notes as they stood (status markers included). `PLAN.md` keeps only open work; the rules these slices produced live in the `CLAUDE.md` files, and the reasons in `docs/patterns/`.

| Slice | What it built |
|---|---|
| [Slice 1 — Walking skeleton + "I fed / I saw King" ✅](slice-1-walking-skeleton.md) | 2026-10-08 · Aspire, the API and SPA skeleton, "I fed" / "I saw King" with undo |
| [Slice 2 — Multi-select food, About/Privacy, location & map ✅](slice-2-food-pages-location.md) | 2026-10-08 · multi-select food, About and Privacy, nicknames, feeding spots, location and the map (phases 2a, 2b) |
| [Slice 3 — History page: heat map + full log ✅](slice-3-history.md) | 2026-10-08 · the history page: heat map, full log, "where" made obvious (phase 3b) |
| [Slice 4 — Admin: hide spam, rename places ✅](slice-4-admin.md) | 2026-10-09 → 11 · admin key, hiding spam per entry or device, rename and merge places, the audit log |
| [Slice 4b — Posting only from the US ✅](slice-4b-us-only-posting.md) | 2026-10-11 · posting only from US addresses (DB-IP Country Lite in the image) |
| [Slice 5 — Go live on Azure Container Apps ✅](slice-5-go-live.md) | 2026-10-11 · Azure Container Apps, DocumentDB, Cloudflare DNS, deploy and provision scripts, nightly backup, Application Insights |
| [Slice 6 — Photos ✅](slice-6-photos.md) | 2026-10-12 · photos on sightings, seen feedings and /photos; metadata stripped; admin hiding with reasons; site size cut |
| [Security review fixes ✅](security-review-1-fixes.md) | 2026-10-12 · security headers, read and photo-file limits, 64 KB bodies (the first review's fixes 2, 3, 5) |
| [Security review 2 fixes ✅](security-review-2-fixes.md) | 2026-10-19 · device key in a header, Cross-Origin-Resource-Policy, names cleaned of invisible characters, uploads at once |
| [Undo from Lately, History and Photos ✅](undo-from-lists.md) | 2026-10-19 · undo one's own posts from Lately, History and Photos |
| [About page: King's age and kitten photo ✅](about-page-age-and-kitten.md) | 2026-10-12 · King's age worked out from January 2015, the kitten photo |
| [Telemetry: real failures, and the browser's errors ✅](telemetry-real-failures.md) | 2026-10-19 → 24 · the Azure Monitor exporter instead of the agent, real response codes, 5xx alert, the browser's errors reported |
| [Small gaps from the Failures investigation ✅](small-gaps-failures-investigation.md) | 2026-10-20 · crown icons, robots.txt and noindex, photo storage warmed at start |
| ["Somewhere new" on "I saw King" ✅](somewhere-new-on-seen.md) | 2026-10-24 · a new spot from the sighting flow, logging the sighting there |
