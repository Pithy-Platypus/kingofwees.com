# Slice 1 — Walking skeleton + "I fed / I saw King" ✅

_Moved from `PLAN.md` on 2026-10-24, as it stood._

| # | Step | Status |
|---|---|---|
| 1 | Scaffold: Aspire 13.6 (`aspire new`), `.slnx`, Central Package Management, `Directory.Build.props` (warnings = errors), Bun package manager (7-day release gate, no install scripts) | ✅ |
| 2 | Test harness: xUnit v3 (Microsoft.Testing.Platform), Playwright + axe e2e booting the real AppHost | ✅ |
| 3 | MongoDB in Aspire (`PersistData=false` for tests) | ✅ |
| 4 | Domain + minimal API: feedings, sightings, status, undo (10 min, same device); `CanPost` policy; rate limit; metrics; FluentValidation with error codes | ✅ |
| 5 | Frontend foundation: Tailwind v4 + daisyUI `king` theme, self-hosted fonts, lint bans inline styles and literal text | ✅ |
| 6 | i18n: react-intl, `en-XA` pseudo-locale, catalog-freshness test | ✅ |
| 7 | Screens: home, feed, logged; double-tap guards; focus management | ✅ |
| 8 | E2E: kid flow, undo, keyboard-only, WCAG 2.2 AA on every screen, target size, pseudo-locale | ✅ |
| 9 | Docs: folder READMEs, `docs/patterns/validation.md` | ✅ |
| 10 | Mutation testing: StrykerJS (command runner); Stryker.NET dropped (no MTP support) | ✅ |
