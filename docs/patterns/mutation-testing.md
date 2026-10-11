# Mutation testing (StrykerJS)

StrykerJS runs with the **command runner** (`bun run test`): `@stryker-mutator/vitest-runner` 10.0.0 never activated mutants under Vitest 5 (Decisions log, 2026-10-08). The command runner sees the whole Vitest suite as **one test**, and that changes what incremental mode can know.

**Incremental mode reuses results after test changes.** Measured 2026-10-11 (Slice 5 phase end): after `routing.test.tsx` gained a test and `routes.ts` gained a line, `bun run mutate --mutate src/routing/routes.ts` reported 84.62% for `routes.ts` in 12 seconds — 1 dry run, the other results taken from `reports/stryker-incremental.json`. With `--force` the same 26 mutants were all re-run (1 min 25 s): still 84.62%, but now 21 killed / 1 timeout / 4 survived instead of 18 / 4 / 4. The score happened to match; it needn't. A test that newly kills a mutant, or a deleted test that stops killing one, doesn't show without `--force`, because the one "test" Stryker tracks — the suite — never changes identity.

So: after changing tests, run with `--force` (scope it with `--mutate <file>` to keep it short). Incremental mode stays on for runs where only source files changed, which it does detect.
