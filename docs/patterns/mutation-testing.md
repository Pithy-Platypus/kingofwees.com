# Mutation testing (StrykerJS)

StrykerJS runs with the **command runner** (`bun run test`): `@stryker-mutator/vitest-runner` 10.0.0 never activated mutants under Vitest 5 (Decisions log, 2026-10-08). The command runner sees the whole Vitest suite as **one test**, and that changes what incremental mode can know.

**Incremental mode reuses results after test changes.** Measured 2026-10-11 (Slice 5 phase end): after `routing.test.tsx` gained a test and `routes.ts` gained a line, `bun run mutate --mutate src/routing/routes.ts` reported 84.62% for `routes.ts` in 12 seconds — 1 dry run, the other results taken from `reports/stryker-incremental.json`. With `--force` the same 26 mutants were all re-run (1 min 25 s): still 84.62%, but now 21 killed / 1 timeout / 4 survived instead of 18 / 4 / 4. The score happened to match; it needn't. A test that newly kills a mutant, or a deleted test that stops killing one, doesn't show without `--force`, because the one "test" Stryker tracks — the suite — never changes identity.

So: after changing tests, run with `--force` (scope it with `--mutate <file>` to keep it short). Incremental mode stays on for runs where only source files changed, which it does detect.

## Speed

Because every mutant runs the whole suite, the suite's own time is multiplied by the mutant count. Measured 2026-10-18 (419 tests, `--force --mutate src/routing/routes.ts`, 27 mutants):

| Setup | Time | Killed / Timeout / Survived |
|---|---|---|
| default `forks` pool, full suite per mutant | 125 s | 22 / 1 / 4 |
| `pool: 'threads'` (in `vite.config.ts`) + `bun run test --bail=1` (Stryker's command only) | 64 s | 23 / 0 / 4 |

The same mutants survived. The one difference: a mutant that timed out when the suite ran to the end is killed under `--bail=1` by an earlier failing test before the hanging one runs. Stryker counts both as detected, so the score is the same. `--bail=1` stays out of `bun run test` itself so ordinary runs still list every failure. A plain `vitest run` went from ~3.9 s to ~3.3 s with `threads`.

Tried and not taken:
- **`pool: 'vmThreads'`** (Vitest's own suggestion, ~3.1 s): Vitest documents memory leaks and `instanceof` mismatches with Node's built-ins (`Buffer`, `Uint8Array`) inside VM contexts, and `build/precompress.test.ts` and the photo code use them. The 0.2 s isn't worth a test that passes or fails because of the pool.
- **`isolate: false`**: test files share module state (stores, `localStorage`, mocks), so results can depend on file order; with `threads` it also found no tests.
- **Stryker `concurrency` 4 instead of 2**: same 64 s — each Vitest run already uses every core.
