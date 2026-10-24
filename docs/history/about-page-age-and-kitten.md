# About page: King's age and kitten photo ✅

_Moved from `PLAN.md` on 2026-10-24, as it stood._

Wallie asked (2026-10-12) for King's age to be worked out rather than typed, and for his kitten photo on the About page.

| # | Step | Status |
|---|---|---|
| 1 | **Age from his birth year.** `kingAge(now)` in `src/king/time.ts` (born January 2015, so a year older each 1 January, visitor's local time); About's story and Home's tagline take `{age}` (About picks "a"/"an" with an ICU plural); `AboutPage` takes `now` like the other pages. The root README no longer states an age. | ✅ |
| 2 | **Kitten photo on About**, under the story: a 480 px square crop around him (`public/king/king-kitten-small.jpg`, 44 kB, quality 60) linking to the whole picture (`king-kitten.jpg`, 1200×1600, 398 kB, quality 80), both metadata-stripped; captioned; same link idiom and focus ring as `/photos`. | ✅ |
| 3 | Lint, 419/419 tests, build warning-free; StrykerJS `--force`: `time.ts` 100%, `AboutPage.tsx` 77.36% (all 12 survivors are translator `description` strings). **Deployed 2026-10-12** (`53732bc`): both kitten images served at their built sizes, the live script is the built `index-ToKYTx9j.js`. | ✅ |
