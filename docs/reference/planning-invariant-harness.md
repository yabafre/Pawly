# Planning Invariant Harness (Story 13-8, KON-138)

Property-based + end-to-end safety net for the planning engine. Locks the guarantees
built across Epic 13 so they hold over the input space, not just hand-picked fixtures.

## Files

- `apps/api/src/modules/planning/planning-harness.testutil.ts` — shared harness:
  `fast-check` arbitraries (`planningFixtureArb`), the Nest module builder
  (`createGenerationHarness` — REAL `PlanningGenerationService` + REAL
  `SolverEngineService`, mocked Prisma/peripherals), `configureFixture` (maps a sampled
  fixture onto every mock), and two deterministic fixtures: `buildServedCpsatFixture`
  (full month, exercises the AC-2 tRPC path end-to-end) and `buildImprovableCpsatFixture`
  (a greedy-suboptimal case where the exact engine is genuinely served — see below). NOT a
  `*.spec.ts`; kept out of the production bundle by `.swcrc` (see § Build safety).
- `apps/api/src/modules/planning/planning-invariants.property.spec.ts` — the three
  properties: **P1** statutory safety (independent re-evaluation via
  `findStatutoryViolations`), **P2** improve-never-degrade, **P3** determinism — plus one
  deterministic **served-cpsat** test (the exact-engine positive arm + solver canary).
- `apps/api/src/modules/planning/planning-generation.integration.spec.ts` — the one
  tRPC `generatePlan({ engine: 'cpsat' })` path through the real router → service →
  solver → replay → `$transaction`.

## Running

```bash
pnpm --filter @pawly/api test src/modules/planning/planning-invariants.property.spec.ts
pnpm --filter @pawly/api test src/modules/planning/planning-generation.integration.spec.ts
```

## CI budget

`numRuns` follow the ladder `process.env.CI ? … : process.env.TURBO_HASH ? … : …`
(fewer runs on shared/parallel runners) with per-`it` timeouts, mirroring the NFR2
budget pattern in `planning-generation.service.spec.ts`.

## Exact-engine (cpsat) coverage — read before adding cpsat invariants

The bounded `planningFixtureArb` (≤5 employees, a 2-entry 4h menu, 1–3 workdays, no
unavailabilities, no configurable rules) is trivially satisfiable: **greedy(+the depth-3
repair pass) already fills every slot**, so the CP-SAT improve pass finds nothing to
improve and serves the greedy plan (`solverOutcome: 'no-improvement'`). Consequently the
`cpsat` arms of **P2** and **P3**, and the AC-2 integration path, only ever exercise the
*never-degrade* side (a trivially-true `greedy`-vs-`greedy` comparison) — they do NOT, on
the arbitrary alone, prove the exact engine ever solves and wins.

Two guards close that gap:

1. **`buildImprovableCpsatFixture` + its deterministic test** (in the property spec) is
   the one place the harness proves the exact engine genuinely solves, strictly improves
   fill/holes, survives replay-revalidation, and is **served** (`engine === 'cpsat'`,
   `solverOutcome === 'served'`). It runs the fixture with `enableRepair: false` so the
   solver's baseline is the raw hole-bearing greedy plan rather than the repaired one
   (`enableRepair` is the engine's documented internal test seam — defaults ON, never
   forwarded by the tRPC route). Because the real greedy+repair path fills this fixture,
   a served-cpsat plan cannot be produced through the tRPC route, so this positive proof
   lives at the service layer, not in AC-2.
2. **Solver canary.** The same test asserts `engine === 'cpsat'`; the AC-2 test asserts
   `solverOutcome !== 'engine-unavailable'`. If or-tools fails to load (e.g. Node < 22.12,
   the solver's real floor — the repo pins `.nvmrc`/`engines` accordingly) the served
   engine silently degrades to greedy, and these assertions fail **loudly** instead of
   letting the cpsat coverage go vacuously green.

## Build safety (SWC, not tsconfig)

`nest build` uses the **SWC builder** (`nest-cli.json`), which does **NOT** honour the
`exclude` globs in `tsconfig.build.json` — proof: `*.spec.ts` files were emitted into
`dist/` for years despite the `**/*spec.ts` exclude there. The dev-only imports of the
harness (`fast-check`, `@nestjs/testing`) are therefore kept out of the production bundle
by the `exclude` array in **`apps/api/.swcrc`** (`.*\.spec\.ts$`, `.*\.testutil\.ts$`).
`tsconfig.build.json` keeps the same globs as belt-and-suspenders for any tsc-based
consumer. When adding a new test-only helper, name it `*.testutil.ts` (or `*.spec.ts`) so
both filters catch it, and verify with a clean `nest build` that it is absent from `dist/`.

## Adding a new invariant

1. Extend `planningFixtureArb` if the invariant needs new input dimensions (keep
   survivors legal-by-construction so the served plan stays clean; if you add
   job-type-gated slots, the survivor rows already carry `employee.jobType`).
2. Add an `it(...)` that runs `generateMonthlyPlan` via the harness and asserts the
   property. Prefer **independent** re-evaluation (pure evaluators like
   `findStatutoryViolations`) over the SUT's self-reported arrays — on the cpsat path
   `validateShiftsAgainstRules` is mocked.
3. If the invariant is about the *exact engine winning* (not just never degrading), model
   it on `buildImprovableCpsatFixture` (a greedy-suboptimal fixture run with
   `enableRepair: false`) and assert `solverOutcome === 'served'` — otherwise it will pass
   vacuously against a served greedy plan.
4. Pick `numRuns` from the CI ladder; cpsat properties run the real solver, so keep
   their run counts low.

## Load-bearing rule

A property that surfaces a genuine engine violation is a **bug report**, not a test to
relax. Open a follow-up; do not patch the engine to make the property pass.
