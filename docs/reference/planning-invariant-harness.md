# Planning Invariant Harness (Story 13-8, KON-138)

Property-based + end-to-end safety net for the planning engine. Locks the guarantees
built across Epic 13 so they hold over the input space, not just hand-picked fixtures.

## Files

- `apps/api/src/modules/planning/planning-harness.testutil.ts` — shared harness:
  `fast-check` arbitraries (`planningFixtureArb`), the Nest module builder
  (`createGenerationHarness` — REAL `PlanningGenerationService` + REAL
  `SolverEngineService`, mocked Prisma/peripherals), and `configureFixture`
  (maps a sampled fixture onto every mock). NOT a `*.spec.ts`; excluded from the
  SWC build via `tsconfig.build.json`.
- `apps/api/src/modules/planning/planning-invariants.property.spec.ts` — the three
  properties: **P1** statutory safety (independent re-evaluation via
  `findStatutoryViolations`), **P2** improve-never-degrade, **P3** determinism.
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

## Adding a new invariant

1. Extend `planningFixtureArb` if the invariant needs new input dimensions (keep
   survivors legal-by-construction so the served plan stays clean).
2. Add an `it(...)` that runs `generateMonthlyPlan` via the harness and asserts the
   property. Prefer **independent** re-evaluation (pure evaluators like
   `findStatutoryViolations`) over the SUT's self-reported arrays — on the cpsat path
   `validateShiftsAgainstRules` is mocked.
3. Pick `numRuns` from the CI ladder; cpsat properties run the real solver, so keep
   their run counts low.

## Load-bearing rule

A property that surfaces a genuine engine violation is a **bug report**, not a test to
relax. Open a follow-up; do not patch the engine to make the property pass.
