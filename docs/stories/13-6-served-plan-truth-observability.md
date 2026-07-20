# Story: 13-6-served-plan-truth-observability — Served-Plan Truthfulness & Solver Observability

**Epic:** Epic 13 — Planning Integrity & Solver Fidelity
**Status:** ready-for-dev
**Branch:** feature/KON-137-13-6-served-plan-truth-observability
**Ticket:** KON-137 (Linear · project Pawly · blocked by KON-135 [done], blocks KON-138)
**Origin:** Audit findings T6 + T11 (2026-07-14) — `docs/triage-decision.md`. T6 = a served cpsat plan exposes the GREEDY plan's violation arrays; T11 = engine/status not metric'd, so a silent cpsat→greedy degradation is invisible in monitoring.

> **Read first:** `docs/epics-context/epic-13-context.md` — §3 invariants **6** (byte-identical greedy default: 13-6 must not perturb the greedy path), **7** (tier gate on the VALUE: observability additions must not leak Pro info to Starter responses), **2** (determinism); §4 anchor map for 13-6.
>
> **Key discovery that shapes the design (verified in code at story time).** `SolverEngineService.solve()` **swallows every exception** (`solver-engine.service.ts:70-75`) and returns `status: 'UNKNOWN'`. So the exact scenario AC-2 exists to alert on — a Node < 22.12 deploy where `or-tools-wasm` fails to load — currently degrades into `UNKNOWN`, **indistinguishable from a genuine "budget exhausted / no solution".** Without a distinct signal, `solver_status` could never tell an ops team "the engine is down" from "the model was hard this month". Task 2 therefore adds a distinct `ENGINE_UNAVAILABLE` status at the adapter's catch — the ONLY place that knows the engine itself failed vs. the solver ran and found nothing.
>
> **Scope decision (locked with Alex at story time — GO).** AC-1's recompute reuses `PlanningService.validateShiftsAgainstRules` — the same whole-schedule evaluator the publish gate and the schedule view already use. Consequence, accepted deliberately: on the **cpsat** path the served violations reflect the **whole persisted schedule** (manual + survivors + generated), evaluated by the publish gate, so *what generation reports == what publish will check*. The **greedy** path keeps its per-slot accumulated arrays untouched (invariant 6, byte-identical). Two evaluators for two engines is the intended tradeoff: the recompute is the more-authoritative truth, and it may only run on the opt-in Pro path. The recompute is gated on `servedEngine === 'cpsat'`; `solverOutcome` is **omitted** for greedy requests (invariant 7 — no Pro leak).

## User Story

**As an** admin — and as the ops team, **I want** the served plan's violations, engine, and outcome to be truthful and monitorable, **so that** "System Never Lies" holds on the solver path and a silent cpsat degradation is visible in SigNoz.

## Acceptance Criteria

1. **Given** a served cpsat plan, **When** the generation result is built, **Then** `violations.hard` / `violations.soft` (and the `hardViolationCount` / `softWarningCount` stats derived from them) reflect the **served assignments**, evaluated by the same whole-schedule rule check the publish gate applies — never the greedy plan's accumulated arrays (audit T6). **And** the default greedy path is byte-identical to today: no recompute runs, no extra query, and the served result is unchanged (invariant 6).
2. **Given** any generation, **When** the duration is recorded, **Then** the `pawly.planning.generation.duration` histogram carries `requested_engine`, `served_engine`, and `solver_status` attributes (`solver_status = 'not-requested'` when greedy was requested), so a fleet-wide cpsat→greedy degradation (e.g. a Node < 22.12 deploy driving a spike of `solver_status='engine-unavailable'`) is alertable in SigNoz.
3. **Given** a Pro admin who requested `engine: 'cpsat'`, **When** greedy is served, **Then** `stats.solverOutcome` distinguishes the reason — one of `engine-unavailable` / `infeasible` / `budget-exhausted` / `no-improvement` / `rejected-revalidation` (and `served` when cpsat was served) — **and** the generation panel surfaces it (served-engine badge shows the reason + a toast), with FR and EN strings. **And** for a greedy request `stats.solverOutcome` is absent (invariant 7).

## Tasks

- [ ] **Task 1 — Contract: add `solverOutcome` to `generationStatsSchema`** [AC: 1, 3]

  In `packages/validators/src/planning/planning-generation.schema.ts`, add the outcome enum + type immediately above `generationStatsSchema` (right after the `SoftViolation` block ends at line 100, before the `// ── Generation result schema` comment):

  ```ts
  // ── Solver outcome (Story 13-6, KON-137 — T6/T11) ────────────────────────

  // The reason the exact (cpsat) improve pass did or didn't serve its plan. Present
  // only when the exact engine was requested; a greedy request omits it so a Starter
  // response never carries solver internals (tier-gate invariant #7).
  export const solverOutcomeSchema = z.enum([
    'served', // cpsat plan was served (strictly better + re-validated)
    'engine-unavailable', // solver failed to load/run (e.g. Node < 22.12) — greedy served
    'infeasible', // solver proved no valid schedule — greedy served
    'budget-exhausted', // solver found no solution within its deterministic budget — greedy served
    'no-improvement', // solver ran but did not strictly beat greedy — greedy served
    'rejected-revalidation', // solver plan failed the re-validation replay — greedy served
  ]);
  export type SolverOutcome = z.infer<typeof solverOutcomeSchema>;
  ```

  Then add the field to `generationStatsSchema` (after the `engine` field at line 112, inside the object):

  ```ts
    // Story 13-6 (KON-137) — why the cpsat pass did/didn't serve. Optional: omitted
    // for greedy requests so a Starter response never carries solver internals (#7).
    solverOutcome: solverOutcomeSchema.optional(),
  ```

  Export it from `packages/validators/src/planning/index.ts`. Add `solverOutcomeSchema,` to the value export from `"./planning-generation.schema"` (the block ending at line 84, after `generationResultSchema,`):

  ```ts
    generationResultSchema,
    solverOutcomeSchema,
  } from "./planning-generation.schema";
  ```

  And add `SolverOutcome,` to the type export from the same module (the block ending at line 97, after `GenerationResult,`):

  ```ts
    GenerationResult,
    SolverOutcome,
  } from "./planning-generation.schema";
  ```

  Then add a schema test in `packages/validators/src/planning/planning-generation.schema.test.ts`, inside the existing `describe('generationStatsSchema', ...)` block (find it — it validates the stats object). Add:

  ```ts
    it('accepts a valid solverOutcome (Story 13-6)', () => {
      const result = generationStatsSchema.safeParse({
        totalSlots: 10,
        filledSlots: 10,
        holeCount: 0,
        hardViolationCount: 0,
        softWarningCount: 0,
        engine: 'cpsat',
        solverOutcome: 'served',
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown solverOutcome (Story 13-6)', () => {
      const result = generationStatsSchema.safeParse({
        totalSlots: 10,
        filledSlots: 10,
        holeCount: 0,
        hardViolationCount: 0,
        softWarningCount: 0,
        engine: 'cpsat',
        solverOutcome: 'gave-up',
      });
      expect(result.success).toBe(false);
    });

    it('omits solverOutcome (greedy request — no Pro leak, Story 13-6)', () => {
      const result = generationStatsSchema.safeParse({
        totalSlots: 10,
        filledSlots: 10,
        holeCount: 0,
        hardViolationCount: 0,
        softWarningCount: 0,
        engine: 'greedy',
      });
      expect(result.success).toBe(true);
    });
  ```

  If `generationStatsSchema` is not already imported at the top of the test file, add it to the import from `'./planning-generation.schema'`.

  Run: `pnpm --filter @pawly/validators test planning-generation.schema`
  Expected: the new cases pass — `Tests:` count up by 3, no failures, exit 0.
  Commit: `git add packages/validators/src/planning/planning-generation.schema.ts packages/validators/src/planning/index.ts packages/validators/src/planning/planning-generation.schema.test.ts && git commit -m "feat(KON-137): add optional stats.solverOutcome contract (T6/T11)"`

- [ ] **Task 2 — solver-engine: distinct `ENGINE_UNAVAILABLE` status** [AC: 3]

  RED first. In `apps/api/src/modules/planning/solver-engine.service.spec.ts`, add this test (at the end of the top-level `describe('SolverEngineService (KON-129)', ...)` block — it forces the internal solve to throw and asserts the catch surfaces the new status, no real solver needed):

  ```ts
  it('surfaces ENGINE_UNAVAILABLE instead of throwing when the engine fails to load (Story 13-6)', async () => {
    const service = new SolverEngineService();
    jest
      .spyOn(
        service as unknown as {
          solveUnsafe: (...args: unknown[]) => Promise<unknown>;
        },
        'solveUnsafe',
      )
      .mockRejectedValue(new Error('ERR_REQUIRE_ESM'));
    const result = await service.solve(
      { vars: [], constraints: [], objective: [] },
      { deterministicTimeBudget: 0.05 },
    );
    expect(result.status).toBe('ENGINE_UNAVAILABLE');
    expect(result.chosenVarNames.size).toBe(0);
  });
  ```

  Run: `pnpm --filter @pawly/api test solver-engine.service` → this test FAILS (status is `'UNKNOWN'`).

  Then GREEN in `apps/api/src/modules/planning/solver-engine.service.ts`. Extend the status union (line 25):

  ```ts
  export type SolveStatus =
    | 'OPTIMAL'
    | 'FEASIBLE'
    | 'INFEASIBLE'
    | 'UNKNOWN'
    | 'ENGINE_UNAVAILABLE';
  ```

  And change the `solve()` catch (lines 72-75) to return the distinct status:

  ```ts
    } catch (error) {
      // Story 13-6 (KON-137, T11) — a throw here means the ENGINE ITSELF failed
      // (e.g. or-tools-wasm cannot load on Node < 22.12), not that the solver ran
      // and found nothing. Surface a distinct status so `solver_status` can tell an
      // ops team "the engine is down" (alertable) from "the model was infeasible".
      this.logger.warn(`CP-SAT solve threw: ${String(error)}`);
      return { status: 'ENGINE_UNAVAILABLE', chosenVarNames: new Set() };
    }
  ```

  Run: `pnpm --filter @pawly/api test solver-engine.service`
  Expected: all `SolverEngineService (KON-129)` tests pass, including the new one — `Tests: <n> passed`, exit 0. (The `reports a terminal status ... on an exhausted deterministic budget` test still asserts `['OPTIMAL','FEASIBLE','UNKNOWN']` — unaffected, since a real budget-exhausted solve returns via `solveUnsafe`, not the catch.)
  Commit: `git add apps/api/src/modules/planning/solver-engine.service.ts apps/api/src/modules/planning/solver-engine.service.spec.ts && git commit -m "feat(KON-137): distinct ENGINE_UNAVAILABLE solver status (T11)"`

- [ ] **Task 3 — `runSolverImprovePass` returns a discriminated outcome** [AC: 3]

  In `apps/api/src/modules/planning/planning-generation.service.ts`, first add the `SolverOutcome` type to the existing `@pawly/validators` type import (the block at lines 56-61 that already imports `GenerationResult, HardViolation, SoftViolation, EquitySummaryEntry`):

  ```ts
  import type {
    GenerationResult,
    HardViolation,
    SoftViolation,
    EquitySummaryEntry,
    SolverOutcome,
  } from '@pawly/validators';
  ```

  Then declare the pass-result type at module scope, immediately below that import block (before the `@Injectable()` class):

  ```ts
  // Story 13-6 (KON-137) — the improve pass reports WHY it did/didn't serve so the
  // caller can populate stats.solverOutcome and the metric. `served: true` carries the
  // recomputed holes exactly as before; `served: false` carries the fallback reason.
  type SolverPassResult =
    | { served: true; holes: GenerationResult['holes'] }
    | { served: false; outcome: Exclude<SolverOutcome, 'served'> };
  ```

  Change the method return type (line 4331) from `Promise<GenerationResult['holes'] | null>` to `Promise<SolverPassResult>`:

  ```ts
    }): Promise<SolverPassResult> {
  ```

  Now update the FOUR return sites inside `runSolverImprovePass`. (a) Solver status not usable (lines 4516-4521) — map each status to its outcome:

  ```ts
      if (result.status !== 'OPTIMAL' && result.status !== 'FEASIBLE') {
        this.logger.warn(
          `KON-129 solver status ${result.status} — serving the greedy plan`,
        );
        // Story 13-6 (KON-137) — distinguish engine-down from infeasible from
        // budget-exhausted so `solver_status` is actionable in monitoring.
        const outcome: Exclude<SolverOutcome, 'served'> =
          result.status === 'ENGINE_UNAVAILABLE'
            ? 'engine-unavailable'
            : result.status === 'INFEASIBLE'
              ? 'infeasible'
              : 'budget-exhausted';
        return { served: false, outcome };
      }
  ```

  (b) Not strictly better (lines 4580-4588 — replace the `return null;` at the end of that `if (!strictlyBetter)` block):

  ```ts
        this.logger.warn(
          `KON-129 solver ${result.status}: filled ${candidate.length}/${greedyFilled}, equity ${candidateEquity.toFixed(4)} vs ${greedyEquity.toFixed(4)} — greedy plan kept`,
        );
        return { served: false, outcome: 'no-improvement' };
  ```

  (c) Re-validation rejected (lines 4650-4657 — replace the `return null;` in the `if (rejection)` block):

  ```ts
        this.logger.warn(
          `KON-129 solver plan rejected by re-validation (${rejection}) — serving the greedy plan`,
        );
        return { served: false, outcome: 'rejected-revalidation' };
  ```

  (d) Served (lines 4662-4667 — wrap the recomputed holes):

  ```ts
      return {
        served: true,
        holes: this.recomputeHoles(
          ctx.slots,
          ctx.assignedShifts,
          ctx.preExistingSlotCoverage,
          ctx.priorHoles,
        ),
      };
  ```

  Do NOT wire the caller yet (Task 4). This task compiles but the caller still expects the old shape — that is expected; run the type check to confirm ONLY the caller is now red:

  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json`
  Expected: the only NEW error points at the `generatePlan` call site (`if (improvedHoles)` around line 792 — `improvedHoles` is now a `SolverPassResult`). No other new errors. (Pre-existing spec-only strictness errors in untouched files may remain — Story 13-3/13-5 precedent.)
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "refactor(KON-137): runSolverImprovePass returns a discriminated outcome (T11)"`

- [ ] **Task 4 — `generatePlan`: capture `solverOutcome` + metric attributes** [AC: 2, 3]

  In `apps/api/src/modules/planning/planning-generation.service.ts`, replace the cpsat improve-pass block (current lines 772-802 — from `if (options.engine === 'cpsat' && solverBaseline) {` through its closing `}`) with:

  ```ts
      // Story 12-1 (KON-129) — opt-in CP-SAT improve pass; Story 13-6 (KON-137, T11)
      // — capture WHY it did/didn't serve so stats + telemetry can report it.
      let solverOutcome: SolverOutcome | undefined;
      if (options.engine === 'cpsat' && solverBaseline) {
        const solverStart = Date.now();
        try {
          const passResult = await this.runSolverImprovePass({
            employees,
            slots,
            constraints,
            assignedShifts,
            allShiftsForScoring,
            assignmentIndex,
            weeklyMinutesCounter,
            employeeMinutes,
            shiftTypeCounts,
            employeeShiftCounts,
            dayOfWeekCounts,
            quarterlyDayOfWeekCounts,
            preExistingSlotCoverage,
            priorHoles: holes,
            baseline: solverBaseline,
          });
          if (passResult.served) {
            holes.length = 0;
            holes.push(...passResult.holes);
            servedEngine = 'cpsat';
            solverOutcome = 'served';
          } else {
            solverOutcome = passResult.outcome;
          }
        } catch (error) {
          this.logger.warn(
            `KON-129 solver pass failed after ${Date.now() - solverStart}ms — serving the greedy plan: ${String(error)}`,
          );
          // Story 13-6 (KON-137) — an unexpected throw in the pass means the solver
          // could not be used; surface it as engine-unavailable so the fleet metric
          // still alerts (AC-2/AC-3), the same bucket as an adapter load failure.
          solverOutcome = 'engine-unavailable';
        }
      }
  ```

  Then add the three attributes to the metric record (current lines 975-978):

  ```ts
      planningGenerationDuration.record(Date.now() - generationStart, {
        clinic_id: clinicId,
        shift_count: String(createdShifts.length),
        // Story 13-6 (KON-137, T11) — engine/outcome attributes make a fleet-wide
        // cpsat→greedy degradation (e.g. a Node < 22.12 deploy) alertable in SigNoz.
        requested_engine: options.engine ?? 'greedy',
        served_engine: servedEngine,
        solver_status: solverOutcome ?? 'not-requested',
      });
  ```

  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json`
  Expected: the `generatePlan` call-site error from Task 3 is gone; the only remaining NEW error (if any) is the `buildResult` call not yet passing `solverOutcome` — but that arg is optional, so there is likely NO new error. No new errors in `planning-generation.service.ts`.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-137): telemetry engine/solver_status attributes (T11, AC-2)"`

- [ ] **Task 5 — `generatePlan`: recompute served-plan violations + `buildResult` outcome** [AC: 1, 3]

  In `apps/api/src/modules/planning/planning-generation.service.ts`, insert the recompute **immediately before** the `return this.buildResult(` call (current line 980). The persisted shifts are already committed (the `$transaction` above), so this reads the served plan back:

  ```ts
      // Story 13-6 (KON-137, T6) — "System Never Lies" on the solver path. The improve
      // pass mutated `assignedShifts`/holes in place, but the greedy `hardViolations`/
      // `softViolations` arrays still describe the PRE-solver plan. When cpsat is served,
      // recompute violations from the persisted schedule via the same whole-plan evaluator
      // the publish gate uses — so what generation reports == what publish will check. The
      // greedy path keeps its per-slot arrays (byte-identical greedy default, invariant #6).
      let servedHard = hardViolations;
      let servedSoft = softViolations;
      if (servedEngine === 'cpsat') {
        const equityCounters = await this.equityCounterService
          .getCountersForPeriod(clinicId, year, [monthNum])
          .catch(() => [] as CounterWithEmployee[]);
        const revalidated = await this.planningService
          .validateShiftsAgainstRules(
            clinicId,
            {
              startDate: monthStart.toISOString(),
              endDate: monthEnd.toISOString(),
            },
            {
              equityCounters:
                equityCounters.length > 0 ? equityCounters : undefined,
            },
          )
          .catch(() => null);
        if (revalidated) {
          servedHard = revalidated.hardViolations;
          servedSoft = revalidated.softViolations;
        }
      }
  ```

  Then update the `buildResult` call (current lines 980-989) to pass the served arrays + the outcome:

  ```ts
      return this.buildResult(
        createdShifts,
        employees,
        holes,
        servedHard,
        servedSoft,
        totalPositions,
        survivorCoveredPositions,
        servedEngine,
        solverOutcome,
      );
  ```

  Now extend `buildResult` (signature at lines 3628-3644, body at 3660-3678). Add the parameter after `engine`:

  ```ts
      engine: 'greedy' | 'cpsat' = 'greedy',
      solverOutcome?: SolverOutcome,
    ): GenerationResult {
  ```

  And add it to the returned `stats` (after the `engine,` line at 3676). Conditional spread so it is truly absent for greedy requests (invariant 7):

  ```ts
        // Story 12-1 — which engine produced the served assignments.
        engine,
        // Story 13-6 (KON-137) — the fallback reason, present only when cpsat was
        // requested (undefined ⇒ greedy request ⇒ key omitted, no Pro leak).
        ...(solverOutcome ? { solverOutcome } : {}),
  ```

  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json`
  Expected: no new errors in `planning-generation.service.ts`. (`year`, `monthNum`, `monthStart`, `monthEnd` are already declared at the top of `generateMonthlyPlan`, lines ~312-316; `CounterWithEmployee` is already imported at line 72; `equityCounterService` and `planningService` are already injected at lines ~164-166.)
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-137): recompute served cpsat plan violations + stats.solverOutcome (T6, AC-1)"`

- [ ] **Task 6 — API behavioural tests: recompute, metric attributes, outcome per path** [AC: 1, 2, 3]

  All in `apps/api/src/modules/planning/planning-generation.service.spec.ts`, inside the existing `describe('cp-sat improve pass (KON-129)', ...)` block (starts at line ~8621).

  First, add a local `beforeEach` at the very top of that `describe` block so the recompute's evaluator has a default return (the outer `jest.clearAllMocks()` at line 261 wipes it each test, and only the cpsat-SERVED tests call it):

  ```ts
    describe('cp-sat improve pass (KON-129)', () => {
      // Story 13-6 (KON-137) — the served cpsat path recomputes violations via
      // validateShiftsAgainstRules; give it a benign default so the KON-129 tests
      // (which don't assert violations) stay green. getCountersForPeriod already
      // defaults to [] in the outer beforeEach (line 269).
      beforeEach(() => {
        mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
          hardViolations: [],
          softViolations: [],
          rules: [],
        });
      });
  ```

  (Close this `beforeEach` with `});` — the surrounding `describe` body continues with the existing `it(...)` tests.)

  **AC-1 — recompute is used on the served path.** Add:

  ```ts
      it('AC-1 — recomputes served violations from validateShiftsAgainstRules, not the greedy arrays (T6)', async () => {
        buildDepth3CounterExample();
        const recomputed = {
          hardViolations: [] as never[],
          softViolations: [
            {
              ruleId: '11111111-1111-1111-1111-111111111111',
              ruleName: 'Recomputed for served plan',
              category: 'ROTATION_EQUITY',
              message: 'served-plan soft violation',
              affectedEmployeeId: undefined,
              affectedDate: undefined,
              severity: 'warning' as const,
            },
          ],
          rules: [],
        };
        mockPlanningService.validateShiftsAgainstRules.mockResolvedValue(recomputed);

        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { enableRepair: false, engine: 'cpsat' },
        );

        expect(result.stats.engine).toBe('cpsat');
        // The served plan carries the RECOMPUTED soft violation, evaluated over the
        // persisted schedule for the generated month.
        expect(mockPlanningService.validateShiftsAgainstRules).toHaveBeenCalledWith(
          clinicId,
          expect.objectContaining({
            startDate: expect.stringContaining('2026-03-01'),
            endDate: expect.stringContaining('2026-03-31'),
          }),
          expect.any(Object),
        );
        expect(result.violations.soft).toHaveLength(1);
        expect(result.violations.soft[0].ruleName).toBe('Recomputed for served plan');
        expect(result.stats.softWarningCount).toBe(1);
      });

      it('AC-1 — greedy path does NOT recompute (byte-identical default, invariant 6)', async () => {
        buildDepth3CounterExample();
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { enableRepair: false }, // no engine → greedy
        );
        expect(result.stats.engine).toBe('greedy');
        // generateMonthlyPlan never calls validateShiftsAgainstRules on the greedy path.
        expect(mockPlanningService.validateShiftsAgainstRules).not.toHaveBeenCalled();
        expect(result.stats.solverOutcome).toBeUndefined();
      });
  ```

  **AC-2 — metric attributes.** At the TOP of the spec file, add the metrics import (next to the other `@/` imports around line 25):

  ```ts
  import { planningGenerationDuration } from '@/common/metrics';
  ```

  Then add:

  ```ts
      it('AC-2 — records requested_engine / served_engine / solver_status on the metric (T11)', async () => {
        buildDepth3CounterExample();
        const recordSpy = jest.spyOn(planningGenerationDuration, 'record');

        await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-kon-128', {
          enableRepair: false,
          engine: 'cpsat',
        });

        expect(recordSpy).toHaveBeenCalledWith(
          expect.any(Number),
          expect.objectContaining({
            requested_engine: 'cpsat',
            served_engine: 'cpsat',
            solver_status: 'served',
          }),
        );
        recordSpy.mockRestore();
      });

      it('AC-2 — greedy request records solver_status not-requested (T11)', async () => {
        buildDepth3CounterExample();
        const recordSpy = jest.spyOn(planningGenerationDuration, 'record');

        await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-kon-128', {
          enableRepair: false,
        });

        expect(recordSpy).toHaveBeenCalledWith(
          expect.any(Number),
          expect.objectContaining({
            requested_engine: 'greedy',
            served_engine: 'greedy',
            solver_status: 'not-requested',
          }),
        );
        recordSpy.mockRestore();
      });
  ```

  **AC-3 — solverOutcome per fallback reason.** These reuse the `solverEngine.solve` spy pattern already used in this block (see the existing infeasible/non-improving tests). Add:

  ```ts
      it('AC-3 — solverOutcome "no-improvement" when the solver does not beat greedy', async () => {
        buildDepth3CounterExample();
        // A FEASIBLE result identical to greedy → not strictly better → greedy served.
        jest.spyOn(solverEngine, 'solve').mockResolvedValueOnce({
          status: 'FEASIBLE',
          chosenVarNames: new Set(),
        });
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { enableRepair: false, engine: 'cpsat' },
        );
        expect(result.stats.engine).toBe('greedy');
        expect(result.stats.solverOutcome).toBe('no-improvement');
      });

      it('AC-3 — solverOutcome "infeasible" when the solver proves no schedule', async () => {
        buildDepth3CounterExample();
        jest.spyOn(solverEngine, 'solve').mockResolvedValueOnce({
          status: 'INFEASIBLE',
          chosenVarNames: new Set(),
        });
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { enableRepair: false, engine: 'cpsat' },
        );
        expect(result.stats.engine).toBe('greedy');
        expect(result.stats.solverOutcome).toBe('infeasible');
      });

      it('AC-3 — solverOutcome "budget-exhausted" on UNKNOWN', async () => {
        buildDepth3CounterExample();
        jest.spyOn(solverEngine, 'solve').mockResolvedValueOnce({
          status: 'UNKNOWN',
          chosenVarNames: new Set(),
        });
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { enableRepair: false, engine: 'cpsat' },
        );
        expect(result.stats.engine).toBe('greedy');
        expect(result.stats.solverOutcome).toBe('budget-exhausted');
      });

      it('AC-3 — solverOutcome "engine-unavailable" when the engine cannot load (Node < 22.12 class)', async () => {
        buildDepth3CounterExample();
        jest.spyOn(solverEngine, 'solve').mockResolvedValueOnce({
          status: 'ENGINE_UNAVAILABLE',
          chosenVarNames: new Set(),
        });
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { enableRepair: false, engine: 'cpsat' },
        );
        expect(result.stats.engine).toBe('greedy');
        expect(result.stats.solverOutcome).toBe('engine-unavailable');
        // No recompute when greedy is served.
        expect(mockPlanningService.validateShiftsAgainstRules).not.toHaveBeenCalled();
      });
  ```

  Run: `pnpm --filter @pawly/api test planning-generation.service`
  Expected: the whole `cp-sat improve pass (KON-129)` describe is green, including the 8 new tests — `Tests: <n> passed`, exit 0. If the existing `AC1 — serves the solver plan ...` test regressed, it means the local `beforeEach` default was not added — add it.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-137): served-plan truth + telemetry + outcome per path (AC-1/2/3)"`

- [ ] **Task 7 — i18n: solverOutcome strings (FR + EN)** [AC: 3]

  In `apps/web/src/i18n/langs/en.json`, extend the `engine` block (add a comma after `"servedGreedy": "Standard engine"` at line 564 and insert the object):

  ```json
        "servedGreedy": "Standard engine",
        "solverOutcome": {
          "engineUnavailable": "The solver engine is unavailable — standard plan served.",
          "infeasible": "The solver found no valid schedule — standard plan served.",
          "budgetExhausted": "The solver ran out of time budget — standard plan served.",
          "noImprovement": "The solver found no improvement — standard plan served (already optimal).",
          "rejectedRevalidation": "The solver's plan failed re-validation — standard plan served."
        }
  ```

  In `apps/web/src/i18n/langs/fr.json`, mirror it (comma after `"servedGreedy": "Moteur standard"` at line 564):

  ```json
        "servedGreedy": "Moteur standard",
        "solverOutcome": {
          "engineUnavailable": "Le moteur de solveur est indisponible — plan standard servi.",
          "infeasible": "Le solveur n'a trouvé aucun planning valide — plan standard servi.",
          "budgetExhausted": "Le solveur a épuisé son budget de temps — plan standard servi.",
          "noImprovement": "Le solveur n'a pas trouvé mieux — plan standard servi (déjà optimal).",
          "rejectedRevalidation": "Le plan du solveur a échoué à la re-validation — plan standard servi."
        }
  ```

  Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/src/i18n/langs/en.json','utf8')); JSON.parse(require('fs').readFileSync('apps/web/src/i18n/langs/fr.json','utf8')); console.log('both parse OK')"`
  Expected: `both parse OK` (no `SyntaxError` — trailing-comma safety check).
  Commit: `git add apps/web/src/i18n/langs/en.json apps/web/src/i18n/langs/fr.json && git commit -m "feat(KON-137): FR/EN solver outcome strings (AC-3)"`

- [ ] **Task 8 — `useGeneration`: toast per solver outcome** [AC: 3]

  In `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts`:

  Add the type import at the top (next to the existing imports):

  ```ts
  import type { SolverOutcome } from '@pawly/validators';
  ```

  Add the second translations hook (next to the existing `const t = useTranslations('admin.planningGeneration.toast');`):

  ```ts
    const tOutcome = useTranslations('admin.planningGeneration.engine.solverOutcome');
  ```

  Add the outcome→message-key map at module scope (above `export const useGeneration`):

  ```ts
  // Story 13-6 (KON-137) — map the served-plan solver outcome to its i18n key.
  const OUTCOME_MESSAGE_KEY: Record<Exclude<SolverOutcome, 'served'>, string> = {
    'engine-unavailable': 'engineUnavailable',
    infeasible: 'infeasible',
    'budget-exhausted': 'budgetExhausted',
    'no-improvement': 'noImprovement',
    'rejected-revalidation': 'rejectedRevalidation',
  };
  ```

  Replace the `generatePlan` mutation `onSuccess` (the block that currently branches on `variables?.engine === 'cpsat' && result?.stats?.engine === 'greedy'`) with:

  ```ts
        onSuccess: (
          result:
            | { stats?: { engine?: 'greedy' | 'cpsat'; solverOutcome?: SolverOutcome } }
            | undefined,
          variables: { engine?: 'greedy' | 'cpsat' }
        ) => {
          invalidateAll();
          // Story 13-6 (KON-137) — served-engine transparency WITH the reason. When the
          // admin requested cpsat but greedy was served, surface WHY (System Never Lies).
          const outcome = result?.stats?.solverOutcome;
          if (result?.stats?.engine === 'cpsat') {
            toast.success(t('generatedCpsat'));
          } else if (
            variables?.engine === 'cpsat' &&
            outcome &&
            outcome !== 'served'
          ) {
            toast.info(tOutcome(OUTCOME_MESSAGE_KEY[outcome]));
          } else {
            toast.success(t('generated'));
          }
        },
  ```

  Add (or extend) a test in `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.spec.ts` (create it if absent, mirroring the sibling `_hooks/*.spec.ts` setup — mock `sonner`'s `toast` and `next-intl`'s `useTranslations` to return the key). Assert that a cpsat request served greedy with `solverOutcome: 'engine-unavailable'` calls `toast.info` with `engineUnavailable`, and that a served-cpsat result calls `toast.success` with `generatedCpsat`. If no sibling hook spec exists to mirror, add the assertions to the nearest existing generation-panel test instead and note it in the File List.

  Run: `pnpm --filter @pawly/web test useGeneration`
  Expected: the new toast cases pass — `Test Files 1 passed`, exit 0.
  Commit: `git add apps/web/src/app/\[locale\]/admin/planning/_hooks/useGeneration.ts apps/web/src/app/\[locale\]/admin/planning/_hooks/useGeneration.spec.ts && git commit -m "feat(KON-137): toast the solver fallback reason (AC-3)"`

- [ ] **Task 9 — `GenerationPanel`: surface the fallback reason on the badge** [AC: 3]

  In `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx`, add the outcome→key map at module scope (above the component, next to `getMonthOptions`):

  ```tsx
  // Story 13-6 (KON-137) — map the solver outcome to its i18n key for the badge reason.
  const OUTCOME_MESSAGE_KEY: Record<string, string> = {
    'engine-unavailable': 'engineUnavailable',
    infeasible: 'infeasible',
    'budget-exhausted': 'budgetExhausted',
    'no-improvement': 'noImprovement',
    'rejected-revalidation': 'rejectedRevalidation',
  };
  ```

  Add a translations hook for the outcome namespace (next to the existing `const tEngine = useTranslations('admin.planningGeneration.engine');` at line 83):

  ```tsx
    const tOutcome = useTranslations('admin.planningGeneration.engine.solverOutcome');
  ```

  Then, inside the served-engine badge container (the `{generationResult && (` block at lines 351-363), add a reason line after the closing `</Badge>` but before the block's closing `)}`:

  ```tsx
          {generationResult && (
            <div className="flex flex-col items-end gap-1">
              <Badge
                variant="outline"
                data-testid="served-engine"
                className={
                  generationResult.stats.engine === 'cpsat'
                    ? 'text-xs font-medium px-2 py-0.5 border-primary/30 text-primary'
                    : 'text-xs font-medium px-2 py-0.5'
                }
              >
                {tEngine(
                  generationResult.stats.engine === 'cpsat'
                    ? 'servedCpsat'
                    : 'servedGreedy',
                )}
              </Badge>
              {generationResult.stats.solverOutcome &&
                generationResult.stats.solverOutcome !== 'served' && (
                  <span
                    data-testid="solver-outcome-reason"
                    className="text-[11px] text-muted-foreground text-right max-w-[220px]"
                  >
                    {tOutcome(
                      OUTCOME_MESSAGE_KEY[generationResult.stats.solverOutcome],
                    )}
                  </span>
                )}
            </div>
          )}
  ```

  (This replaces the existing `{generationResult && ( <Badge ...>...</Badge> )}` block — the badge markup is unchanged; it is now wrapped in a flex column with the reason line below it. `stats.solverOutcome` is typed on `GenerationResult` after Task 1.)

  Add a test in `apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx` (the existing panel test file — grep for `served-engine` to find the badge tests). Assert: when the mocked `generationResult.stats` has `engine: 'greedy'` and `solverOutcome: 'infeasible'`, the `solver-outcome-reason` testid renders the `infeasible` string; when `solverOutcome` is `'served'` (or absent), the reason element is NOT in the document.

  Run: `pnpm --filter @pawly/web test generation`
  Expected: the panel tests pass including the reason cases — `Test Files 1 passed`, exit 0.
  Commit: `git add apps/web/src/app/\[locale\]/admin/planning/_components/GenerationPanel.tsx apps/web/src/app/\[locale\]/admin/planning/__tests__/generation.spec.tsx && git commit -m "feat(KON-137): show the solver fallback reason on the served badge (AC-3)"`

- [ ] **Task 10 — Full suites + type check + visual verification** [AC: 1, 2, 3]

  Rebuild the shared package (its `dist` feeds both API and web tsc — project memory), then run every touched suite and a type check:

  ```bash
  pnpm --filter @pawly/validators build
  pnpm --filter @pawly/validators test
  pnpm --filter @pawly/api test
  pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json
  pnpm --filter @pawly/web test
  ```

  Run: (the block above)
  Expected: validators + API + web suites all green (`Test Suites: <n> passed` / `Test Files <n> passed`); `tsc --noEmit` reports **no new** errors in `planning-generation.service.ts` / `solver-engine.service.ts` (pre-existing spec-only strictness errors in untouched files may remain — Story 13-3/13-5 precedent).

  **Frontend visual verification (CLAUDE.md — Frontend = visual verification).** With `pnpm dev` running, generate a plan as a Professional admin on a month where the solver falls back (or temporarily mock the outcome), and confirm the served-engine badge shows the reason line + a toast appears. Capture the panel with `mcp__react-grab-mcp__get_element_context` on the `GenerationPanel` and confirm the `solver-outcome-reason` node renders the localized string.

  Commit: `git add -p && git commit -m "chore(KON-137): served-plan truth & observability — full suite green"` (only if uncommitted lint/format fixes remain; otherwise skip).

## Dev Notes

### Existing code at write time (verbatim — verify before editing)

`apps/api/src/modules/planning/solver-engine.service.ts:25` (current `SolveStatus`) and `:69-76` (the swallowing catch — the T11 blind spot):
```ts
export type SolveStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN';
```
```ts
  async solve(model: SolverModel, options: SolveOptions): Promise<SolveResult> {
    try {
      return await this.solveUnsafe(model, options);
    } catch (error) {
      this.logger.warn(`CP-SAT solve threw: ${String(error)}`);
      return { status: 'UNKNOWN', chosenVarNames: new Set() };
    }
  }
```

`apps/api/src/modules/planning/planning-generation.service.ts:730-802` (greedy violation accumulation → repair (holes-only) → solver improve pass — the T6 site: `hardViolations`/`softViolations` are frozen at the greedy plan and never recomputed after repair/solver mutate `assignedShifts`):
```ts
      if (result.holeInfo) holes.push(result.holeInfo);
      hardViolations.push(...result.hardViolations);
      softViolations.push(...result.softViolations);
    }
    // ...local-repair pass recomputes holes only (holes.length = 0; holes.push(...repairedHoles))...
    if (options.engine === 'cpsat' && solverBaseline) {
      const solverStart = Date.now();
      try {
        const improvedHoles = await this.runSolverImprovePass({ /* ...ctx... */ });
        if (improvedHoles) {
          holes.length = 0;
          holes.push(...improvedHoles);
          servedEngine = 'cpsat';
        }
      } catch (error) {
        this.logger.warn(
          `KON-129 solver pass failed after ${Date.now() - solverStart}ms — serving the greedy plan: ${String(error)}`,
        );
      }
    }
```

`apps/api/src/modules/planning/planning-generation.service.ts:975-989` (metric record + buildResult call — the AC-2/AC-1 wiring points):
```ts
    planningGenerationDuration.record(Date.now() - generationStart, {
      clinic_id: clinicId,
      shift_count: String(createdShifts.length),
    });

    return this.buildResult(
      createdShifts,
      employees,
      holes,
      hardViolations,
      softViolations,
      totalPositions,
      survivorCoveredPositions,
      servedEngine,
    );
```

`apps/api/src/modules/planning/planning-generation.service.ts:3628-3679` (`buildResult` — where `stats.solverOutcome` is added):
```ts
  private buildResult(
    createdShifts: Array<{ id: string; employeeId: string; date: Date; startTime: string; endTime: string; shiftTypeCode: string; }>,
    employees: EmployeeInfo[],
    holes: GenerationResult['holes'],
    hardViolations: GenerationResult['violations']['hard'],
    softViolations: GenerationResult['violations']['soft'],
    totalPositions: number,
    survivorCoveredPositions = 0,
    engine: 'greedy' | 'cpsat' = 'greedy',
  ): GenerationResult {
    // ...assignments map...
    return {
      assignments,
      holes,
      violations: { hard: hardViolations, soft: softViolations },
      stats: {
        totalSlots: totalPositions,
        filledSlots: assignments.length + survivorCoveredPositions,
        holeCount: holes.length,
        hardViolationCount: hardViolations.length,
        softWarningCount: softViolations.length,
        engine,
      },
    };
  }
```

`apps/api/src/modules/planning/planning-generation.service.ts:4331` (current `runSolverImprovePass` return type) and its four exits — status-not-usable `:4516-4521`, not-strictly-better `:4580-4588`, replay-rejected `:4650-4657`, served `:4662-4667` — all currently `return null` / `return this.recomputeHoles(...)`:
```ts
  }): Promise<GenerationResult['holes'] | null> {
```

`apps/api/src/modules/planning/planning-generation.service.ts:2304-2342` (the EXISTING call pattern to mirror for the recompute — from `getScheduleView`; the shape `{ hardViolations, softViolations, rules }` is exactly `GenerationResult['violations']` compatible):
```ts
    const [template, validationResult] = await Promise.all([
      /* template fetch */,
      this.planningService
        .validateShiftsAgainstRules(
          clinicId,
          { startDate: monthStart.toISOString(), endDate: monthEnd.toISOString() },
          { equityCounters: equityCounters.length > 0 ? equityCounters : undefined },
        )
        .catch(() => ({ hardViolations: [], softViolations: [], rules: [] })),
    ]);
```

`apps/api/src/common/metrics.ts:6-12` (the histogram — generic; attributes are supplied at the record call, no code change needed here beyond an optional doc update):
```ts
export const planningGenerationDuration = meter.createHistogram(
  'pawly.planning.generation.duration',
  {
    description: 'Duration of monthly planning generation in milliseconds',
    unit: 'ms',
  },
);
```

`packages/validators/src/planning/planning-generation.schema.ts:104-114` (current `generationStatsSchema` — `solverOutcome` is appended):
```ts
export const generationStatsSchema = z.object({
  totalSlots: z.number().int().min(0),
  filledSlots: z.number().int().min(0),
  holeCount: z.number().int().min(0),
  hardViolationCount: z.number().int().min(0),
  softWarningCount: z.number().int().min(0),
  engine: z.enum(['greedy', 'cpsat']).default('greedy'),
});
```

`apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts` (current `onSuccess` — the single `cpsatNoImprovement` branch that Task 8 generalizes):
```ts
      onSuccess: (
        result: { stats?: { engine?: 'greedy' | 'cpsat' } } | undefined,
        variables: { engine?: 'greedy' | 'cpsat' }
      ) => {
        invalidateAll();
        if (variables?.engine === 'cpsat' && result?.stats?.engine === 'greedy') {
          toast.info(t('cpsatNoImprovement'));
        } else if (result?.stats?.engine === 'cpsat') {
          toast.success(t('generatedCpsat'));
        } else {
          toast.success(t('generated'));
        }
      },
```

`apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx:351-363` (current served-engine badge — Task 9 wraps it with the reason line):
```tsx
          {generationResult && (
            <Badge
              variant="outline"
              data-testid="served-engine"
              className={
                generationResult.stats.engine === 'cpsat'
                  ? 'text-xs font-medium px-2 py-0.5 border-primary/30 text-primary'
                  : 'text-xs font-medium px-2 py-0.5'
              }
            >
              {tEngine(generationResult.stats.engine === 'cpsat' ? 'servedCpsat' : 'servedGreedy')}
            </Badge>
          )}
```

### File decisions (3-bullet map)

**`packages/validators/src/planning/planning-generation.schema.ts`** (modify) + `index.ts` (modify) + `.test.ts` (modify)
- *Responsibility:* unchanged — the generation input/output contract. Gains the `solverOutcome` enum + an optional `stats.solverOutcome` field; this is the shared contract both API and web read.
- *Inputs:* `z` from `@pawly/zod`. No new dep.
- *Outputs:* `solverOutcomeSchema` / `SolverOutcome` exported; `GenerationStats`/`GenerationResult` now optionally carry `solverOutcome`.

**`apps/api/src/modules/planning/solver-engine.service.ts`** (modify) + `.spec.ts` (modify)
- *Responsibility:* unchanged — the sole or-tools-wasm adapter. Gains one distinct status (`ENGINE_UNAVAILABLE`) so an engine-load failure is separable from a genuine no-solution.
- *Inputs:* unchanged. *Outputs:* `SolveStatus` widened by one member; the `solve()` catch returns it. No signature or behaviour change on the success path.

**`apps/api/src/modules/planning/planning-generation.service.ts`** (modify) + `.spec.ts` (modify)
- *Responsibility:* unchanged — generation orchestration. `runSolverImprovePass` now reports its outcome; `generateMonthlyPlan` captures it, recomputes served-cpsat violations, and stamps the telemetry; `buildResult` carries `solverOutcome`.
- *Inputs:* adds the `SolverOutcome` type from `@pawly/validators`; reuses the already-injected `planningService` + `equityCounterService` and the already-imported `CounterWithEmployee`.
- *Outputs:* same `GenerationResult` shape, now with truthful cpsat violations + `stats.solverOutcome`. **Every change bites only when `options.engine === 'cpsat'`** — the greedy path is byte-identical.

**`apps/web/src/i18n/langs/{en,fr}.json`** (modify)
- *Responsibility:* unchanged — UI copy. Gains `engine.solverOutcome.*` (5 reasons, FR + EN).
- *Inputs/Outputs:* consumed by `useGeneration` (toast) and `GenerationPanel` (badge reason).

**`apps/web/.../_hooks/useGeneration.ts`** (modify) + spec + **`.../_components/GenerationPanel.tsx`** (modify) + `__tests__/generation.spec.tsx`
- *Responsibility:* unchanged — generation UX. The toast and the served-engine badge now name the fallback reason instead of the single "no improvement" case.
- *Inputs:* `SolverOutcome` type; `stats.solverOutcome` from the result; the new i18n keys.
- *Outputs:* a localized toast + a reason line under the badge, only when cpsat was requested and greedy served.

### Architecture & invariants

- **Reuse the publish evaluator; don't build a second one.** `validateShiftsAgainstRules` already evaluates STAFFING_MINIMUM / SKILL_REQUIREMENT / ROTATION_EQUITY / CONTRACT_COMPLIANCE + statutory limits over a persisted date range and returns the `{ hardViolations, softViolations }` shape (`planning.service.ts:152-167`). The service already calls it in `getScheduleView` (`:2304-2342`) — the recompute mirrors that call exactly. This aligns the served-plan truth with the publish-gate truth ("what generation reports == what publish will check").
- **The recompute reads the PERSISTED plan, so it must run AFTER the `$transaction` commits.** `assignedShifts` is written by `createManyAndReturn` inside the transaction (`:917-929`); `buildResult` runs after it. Placing the recompute right before `buildResult` (Task 5) reads the served shifts back correctly. Do NOT move it inside the transaction.
- **`assignedShifts` already reflects the served plan.** When the solver serves, its re-validation replay removes the greedy shifts and applies the candidate via `applyAssignment`, which pushes onto `ctx.assignedShifts` (`:4685`) — the same array `generateMonthlyPlan` persists. That is why the persisted, then re-read, schedule IS the served plan. (This is also why holes are already recomputed and correct; only the violation arrays lagged.)
- **Invariant 6 — byte-identical greedy default.** The recompute is gated on `servedEngine === 'cpsat'`; on the greedy path `validateShiftsAgainstRules` is never called and the accumulated arrays are served unchanged. The metric gains attributes but the *served result* is unchanged. The `solverOutcome` key is omitted (conditional spread) for greedy. Prove it with the `greedy path does NOT recompute` test (Task 6).
- **Invariant 7 — no Pro leak.** The router gates cpsat behind `requireProfessional` (`planning.router.ts:263-264`), so a Starter can only ever request greedy → `solverOutcome` undefined → absent from `stats`. The metric attribute `solver_status = 'not-requested'` is server-side telemetry, not part of the client payload.
- **Invariant 2 — determinism.** The recompute is a deterministic DB read of the persisted plan through pure rule evaluation; no RNG, no wall-clock in engine logic. The solver seed/budget are untouched. `solverOutcome` is a pure function of the (deterministic) solver path taken.
- **`ENGINE_UNAVAILABLE` is the load-bearing observability primitive.** Without it, Node < 22.12 (or any adapter load failure) is indistinguishable from `budget-exhausted` — the exact false-negative AC-2 must avoid. It lives at the adapter catch because that is the only layer that knows the engine failed vs. the solver ran.
- **`SolverInput` construction (sprint note).** 13-5 made `fixedMonthlyMinutes` + `fixedEquityLoads` REQUIRED on `SolverInput`. 13-6 adds **no new `SolverInput` construction site** — it consumes `runSolverImprovePass`, which already builds the input. No fixture churn on that axis (contrast the 13-5 deviation; memory: `solverinput-required-field-fixtures`).

### Testing

- **API:** Jest, `*.spec.ts`, `rootDir: src`. Run one file: `pnpm --filter @pawly/api test <pattern>`. NEVER `cd apps/api`; NEVER bare root `pnpm test` (rtk shim breaks the root runner — project memory).
- **Extend, don't rebuild.** The cpsat behavioural harness already exists: `describe('cp-sat improve pass (KON-129)')` at `planning-generation.service.spec.ts:8621`, with `buildDepth3CounterExample()`, the `solverEngine.solve` spy pattern (see the infeasible/non-improving tests), `mockPlanningService.validateShiftsAgainstRules` (`:200`), and `mockEquityService.getCountersForPeriod` defaulting to `[]` (`:269`). The new tests live inside that block.
- **Mock hazard — the recompute default.** `jest.clearAllMocks()` in the outer `beforeEach` (`:261`) wipes `validateShiftsAgainstRules` each test. The cpsat-SERVED tests now call it, so Task 6 adds a local `beforeEach` in the cpsat describe returning `{ hardViolations: [], softViolations: [], rules: [] }`. Without it, the existing `AC1 — serves the solver plan` test throws `undefined.catch`. `getCountersForPeriod` already defaults to `[]`, so no extra setup there.
- **Metric spy.** `import { planningGenerationDuration } from '@/common/metrics';` in the spec and `jest.spyOn(planningGenerationDuration, 'record')` — the service imports the same singleton object, so the spy observes the real call. `mockRestore()` after each metric test. (No OTel SDK is registered in tests; `record` is a no-op but the spy still captures its arguments.)
- **`ENGINE_UNAVAILABLE` unit test forces the catch** by spying the private `solveUnsafe` to reject — no real or-tools load needed. The other `SolverEngineService` tests run the real solver (Node ≥ 22.12 in CI).
- **Web:** Vitest, `*.spec.ts` / `*.spec.tsx`. Run: `pnpm --filter @pawly/web test <pattern>`. The panel test file is `admin/planning/__tests__/generation.spec.tsx` (grep `served-engine`). Mock `next-intl`'s `useTranslations` to echo the key, and `sonner`'s `toast` for the hook assertions — follow the existing sibling specs.
- **Shared-package rebuild before tsc (Epic 11 lesson).** `@pawly/validators` has no path-mapping to `src`; API/web `tsc` read its `dist`. Run `pnpm --filter @pawly/validators build` after Task 1 before the API/web type checks (Task 10) or `stats.solverOutcome` will look absent to consumers.

### Dependencies

None added. No Prisma migration, no Trigger.dev task change, no new package. `or-tools-wasm` is untouched (adapter gains one status member). The metric is an existing OTel histogram; only its record-site attributes change. Per lesson **L4**, confirm the `@opentelemetry/api` histogram-attributes usage against Context7 (`metrics.getMeter(...).createHistogram(...).record(value, attributes)`) at dev time if anything about the attribute shape is unclear — it takes a `(value: number, attributes?: Record<string, string>)` pair, which is why every attribute value is stringified.

### Known gaps deliberately left (report, do not fix here)

- **Greedy+repair violation staleness is NOT recomputed** (out of scope). The local-repair pass also mutates `assignedShifts` without recomputing violations, so a greedy+repair plan's soft-violation profile can drift slightly from the accumulated arrays. This story is scoped to T6 (the served *cpsat* plan) and invariant 6 forbids changing the greedy output — recomputing the greedy path via a different evaluator would break byte-identity and a large body of generation tests. Left as-is by design.
- **Two evaluators, two engines.** greedy → per-slot accumulated arrays; cpsat → `validateShiftsAgainstRules`. They can produce different messages/counts for the *same* plan. Accepted (see the scope decision blockquote): the recompute is the more-authoritative truth and only runs on the opt-in Pro path.
- **`solver-hardening-instance.md` (deferred).** Worker-thread offload / instance cap / wall-clock bound depend on this story's `solver_status` telemetry to trigger — reconsider at clinic > 50 employees or SigNoz latency. Not this story.

### Coordination

Story 13-6 is Wave 3, cut on top of Waves 1+2 (13-5 merged — its two required `SolverInput` maps are present). It shares `planning-generation.service.ts` / `solver-engine.service.ts` with sibling stories but on different lines (the improve-pass return + result build + metric, not the manual-write guards, the overlap primitive, or the solver model IR). It **blocks 13-8** (the invariant harness asserts, among others, that a served plan's reported violations match its assignments — this story makes that true on the cpsat path). Whoever merges second re-runs `pnpm --filter @pawly/api test` and `pnpm --filter @pawly/web test`.

### Commit prefix

`feat(KON-137): ...` / `test(KON-137): ...` / `refactor(KON-137): ...`. Stage explicit paths — never `git add .`.

## File List

- `packages/validators/src/planning/planning-generation.schema.ts` (modify)
- `packages/validators/src/planning/index.ts` (modify)
- `packages/validators/src/planning/planning-generation.schema.test.ts` (modify)
- `apps/api/src/modules/planning/solver-engine.service.ts` (modify)
- `apps/api/src/modules/planning/solver-engine.service.spec.ts` (modify)
- `apps/api/src/modules/planning/planning-generation.service.ts` (modify)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` (modify)
- `apps/web/src/i18n/langs/en.json` (modify)
- `apps/web/src/i18n/langs/fr.json` (modify)
- `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.ts` (modify)
- `apps/web/src/app/[locale]/admin/planning/_hooks/useGeneration.spec.ts` (create or modify — mirror sibling hook spec; may fold into the panel test if no sibling exists)
- `apps/web/src/app/[locale]/admin/planning/_components/GenerationPanel.tsx` (modify)
- `apps/web/src/app/[locale]/admin/planning/__tests__/generation.spec.tsx` (modify)

## Dev Agent Record

- **Model:** {{model used}}
- **Started:** {{timestamp}}
- **Completed:** {{timestamp}}

### Summary

### Files changed

### Deviations

### Test output
