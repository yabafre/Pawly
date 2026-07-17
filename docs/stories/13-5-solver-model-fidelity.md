# Story: 13-5-solver-model-fidelity — Solver Model Fidelity — Monthly Baseline & Equity Objective Coherence

**Epic:** Epic 13 — Planning Integrity & Solver Fidelity
**Status:** ready-for-dev
**Branch:** feature/KON-135-13-5-solver-model-fidelity
**Ticket:** KON-135 (Linear · project Pawly · blocked by KON-132 [done], blocks KON-137)
**Origin:** Audit findings T5 + T7 (2026-07-14, HIGH) — `docs/triage-decision.md`. Both hand-verified line-by-line in the audit.

> **Read first:** `docs/epics-context/epic-13-context.md` — §3 invariants 1 (improve-never-degrade), 2 (determinism), 6 (byte-identical greedy default) and §4 anchor map for 13-5.
>
> **Scope decision (locked with Alex at story time — Option A).** T7 has two clauses: (a) the acceptance gate judges a `shiftCount` term the solver's spread doesn't model, and (b) `fixed: 0` ignores survivor load. Making the model's spread survivor-aware (`fixed` = survivor counts) while the gate stays survivor-blind would make the optimizer chase a different objective than the gate judges — *more* spurious "not strictly better" rejections, the opposite of AC-4's intent. So this story makes **both the model spread and the acceptance gate survivor-aware**: `perEmployee.fixed` carries the survivor equity load, and the gate computes `equityObjective` over **survivors + generated** load. This is what AC-2 says literally, it is genuinely fairer (an employee already carrying survivor Saturdays should receive fewer generated ones), and it keeps the model proxy and the gate aligned. Safety property: with **no in-month survivors**, `fixedMonthlyMinutes` and `fixedEquityLoads` are empty → the monthly bound (T5) and the survivor `fixed` (T7b) are **byte-identical to today**; the only always-on change is the added `spread:shift` term (T7a), which aligns the model to a metric the gate already judged. The default greedy engine is untouched (invariant 6) — every change is on the opt-in cpsat path.

## User Story

**As a** Professional admin using the exact (cpsat) engine, **I want** the solver model to deduct survivor loads and optimize the same equity objective the acceptance gate judges, **so that** the cpsat pass delivers improvements instead of systematically falling back to greedy.

## Acceptance Criteria

1. **Given** a clinic with a HARD monthly-hours rule and survivor shifts in the target month, **When** the solver input is built, **Then** the model's monthly bound is the cap minus the survivors' already-worked minutes (the same baseline deduction the weekly bound already applies), so the solver searches the real remaining budget instead of the raw cap and its optimum is no longer discarded on re-validation — the exact engine stops falling back to greedy for this class of clinic.
2. **Given** the same input, **When** the objective is assembled, **Then** it carries a shift-count equity spread alongside the Saturday and weekend spreads, each employee's spread count includes their immovable survivor load, **and** the acceptance gate scores fairness over survivors + generated shifts — so the optimizer optimizes every metric the gate judges.
3. **Given** any month, **When** the model is built, **Then** filling a position always outweighs any equity gain (fill lexicographically dominates, even when a survivor load inflates a spread past the slot count), **and** the same input built twice yields a deep-equal model (determinism).
4. **Given** a fixture combining survivors and a monthly cap, **When** generation runs with the exact engine, **Then** the model handed to the solver carries the deducted monthly bound, the shift spread, and the survivors' spread baseline (asserted by inspecting that model), **and** the served plan reports the cpsat engine where the raw-cap model previously fell back to greedy — asserted in tests.

## Tasks

- [ ] **Task 1 — RED: monthly-baseline deduction spec** [AC: 1]

  In `apps/api/src/modules/planning/solver-model.spec.ts`, extend the `baseInput` factory (lines 35-46) so it provides the new required field, then add the deduction test. First, replace the `baseInput` body:

  ```ts
  const baseInput = (over: Partial<SolverInput> = {}): SolverInput => ({
    employees: [emp('a'), emp('b')],
    slots: [slot('s1', '2026-08-03')],
    unavailable: new Map(),
    fixedWeeklyMinutes: new Map(),
    fixedMonthlyMinutes: new Map(),
    fixedDailyMinutes: new Map(),
    fixedWorkedDates: new Map(),
    fixedRotationCounts: new Map(),
    rotationRules: [],
    equityWeights: { saturday: 1, weekend: 1, shift: 1 },
    ...over,
  });
  ```

  Then add this test inside the `describe('buildSolverModel — hard constraint parity (AC6)', ...)` block, right after the `caps weekly net minutes including the fixed baseline` test (line 163):

  ```ts
  it('deducts the fixed monthly baseline from the monthly cap (T5, mirror of weekly)', () => {
    const input = baseInput({
      employees: [{ ...emp('a'), monthlyCapMinutes: 480 }], // 8h/month cap
      slots: [
        slot('s1', '2026-08-03', '09:00', '17:00'), // 480 net
        slot('s2', '2026-08-10', '09:00', '17:00'),
      ],
      fixedMonthlyMinutes: new Map([['a', 240]]), // 4h of survivors already worked this month
    });
    const model = buildSolverModel(input);
    const monthly = model.constraints.find(
      (c) => c.kind === 'linearLe' && c.tag === 'monthly:a',
    );
    expect(monthly).toBeDefined();
    expect(monthly!.kind === 'linearLe' && monthly!.bound).toBe(480 - 240);
  });
  ```

  Run: `pnpm --filter @pawly/api test solver-model`
  Expected: RED — the new test fails with `Expected: 240, Received: 480` (the raw cap is not yet deducted). The existing solver-model tests stay green.
  Commit: `git add apps/api/src/modules/planning/solver-model.spec.ts && git commit -m "test(KON-135): RED — monthly baseline deducted from the solver cap"`

- [ ] **Task 2 — GREEN: deduct the fixed monthly baseline** [AC: 1]

  In `apps/api/src/modules/planning/solver-model.ts`, add the `fixedMonthlyMinutes` field to `SolverInput`. Replace the `fixedWeeklyMinutes` line (currently at :60-61):

  ```ts
    /** `${employeeId}|${isoWeekMonday}` -> fixed net minutes (border + survivors + school). */
    fixedWeeklyMinutes: Map<string, number>;
    /** employeeId -> fixed net minutes already worked THIS month (survivors) — deducted from the monthly cap, the exact mirror of fixedWeeklyMinutes (Story 13-5, T5). */
    fixedMonthlyMinutes: Map<string, number>;
  ```

  Then replace the monthly-cap constraint block (currently at :281-292):

  ```ts
      // Monthly cap when configured. The fixed survivor baseline is deducted from
      // the bound — the exact mirror of the weekly cap above (Story 13-5, T5).
      // Without it the model searched the full cap while survivors already consumed
      // part of it, so its optimum tripped the real cap on replay and the whole
      // candidate was discarded — "always serve greedy" for every survivor-bearing
      // capped clinic (same bug class as the weekly regression, service :4277-4284).
      if (e.monthlyCapMinutes !== null) {
        const fixed = input.fixedMonthlyMinutes.get(e.id) ?? 0;
        constraints.push({
          kind: 'linearLe',
          tag: `monthly:${e.id}`,
          terms: evSlots.map(({ v, s }) => ({
            varName: v.name,
            coeff: netMinutes(s),
          })),
          bound: Math.max(0, e.monthlyCapMinutes - fixed),
        });
      }
  ```

  Run: `pnpm --filter @pawly/api test solver-model`
  Expected: GREEN — `Tests: <n> passed` (the monthly test now reads 240), no regressions.
  Commit: `git add apps/api/src/modules/planning/solver-model.ts && git commit -m "feat(KON-135): deduct survivor monthly baseline from the solver cap (T5)"`

- [ ] **Task 3 — RED: shift-spread + survivor fixed + fill-dominance spec** [AC: 2, 3]

  In `apps/api/src/modules/planning/solver-model.spec.ts`, add the `EmployeeLoad` type to the import (lines 1-7):

  ```ts
  import {
    buildSolverModel,
    decodeSolution,
    type SolverInput,
    type SolverEmployee,
    type SolverSlot,
  } from './solver-model';
  import type { EmployeeLoad } from './local-repair';
  ```

  Add the `fixedEquityLoads` field to the `baseInput` factory (right after `fixedMonthlyMinutes` you added in Task 1):

  ```ts
      fixedMonthlyMinutes: new Map(),
      fixedEquityLoads: new Map<string, EmployeeLoad>(),
  ```

  Then add these three tests at the end of the `describe('objective + decode', ...)` block (after the deterministic-build test at line 281):

  ```ts
  it('adds a shift-spread term mirroring equityObjective (T7a)', () => {
    const input = baseInput({
      employees: [emp('a'), emp('b')],
      slots: [slot('s1', '2026-08-03'), slot('s2', '2026-08-04')],
    });
    const model = buildSolverModel(input);
    expect(
      model.constraints.some(
        (c) => c.kind === 'spread' && c.tag === 'spread:shift',
      ),
    ).toBe(true);
    expect(model.objective.some((t) => t.tag === 'spread:shift')).toBe(true);
  });

  it("carries the survivors' equity load as the spread's fixed baseline (T7b)", () => {
    const input = baseInput({
      employees: [emp('a'), emp('b')],
      slots: [slot('sat1', '2026-08-01'), slot('mon1', '2026-08-03')], // 08-01 is a Saturday
      fixedEquityLoads: new Map<string, EmployeeLoad>([
        ['a', { saturdayCount: 2, weekendCount: 3, shiftCount: 5 }],
      ]),
    });
    const model = buildSolverModel(input);
    const shiftSpread = model.constraints.find(
      (c) => c.kind === 'spread' && c.tag === 'spread:shift',
    );
    const aShift =
      shiftSpread?.kind === 'spread'
        ? shiftSpread.perEmployee.find((p) => p.employeeId === 'a')
        : undefined;
    expect(aShift?.fixed).toBe(5);

    const satSpread = model.constraints.find(
      (c) => c.kind === 'spread' && c.tag === 'spread:saturday',
    );
    const aSat =
      satSpread?.kind === 'spread'
        ? satSpread.perEmployee.find((p) => p.employeeId === 'a')
        : undefined;
    expect(aSat?.fixed).toBe(2);
  });

  it('keeps fill dominant even when a survivor baseline inflates the spread (AC-3)', () => {
    // 'a' carries 5 survivor shifts; the shift-count spread can reach 6 (5 fixed + 1
    // free) — past the 1-slot count — so the fill-dominance bound must grow with it.
    const input = baseInput({
      employees: [emp('a'), emp('b')],
      slots: [slot('s1', '2026-08-03')],
      fixedEquityLoads: new Map<string, EmployeeLoad>([
        ['a', { saturdayCount: 0, weekendCount: 0, shiftCount: 5 }],
      ]),
    });
    const model = buildSolverModel(input);
    const fillTerms = model.objective.filter((t) => t.tag === 'fill');
    const spreadTerms = model.objective.filter((t) => t.tag !== 'fill');
    const minFill = Math.min(...fillTerms.map((t) => Math.abs(t.weight)));
    const sumSpread = spreadTerms.reduce((s, t) => s + Math.abs(t.weight), 0);
    // Largest per-employee count any active spread can reach (terms + survivor fixed).
    const maxCount = Math.max(
      ...model.constraints.flatMap((c) =>
        c.kind === 'spread'
          ? c.perEmployee.map((p) => p.terms.length + p.fixed)
          : [],
      ),
    );
    // Filling one slot must beat collapsing every weighted spread from its max to 0.
    expect(minFill).toBeGreaterThan(sumSpread * maxCount);
  });
  ```

  Run: `pnpm --filter @pawly/api test solver-model`
  Expected: RED — `spread:shift` does not exist yet (first two tests fail), and the survivor `fixed` inflates the spread past the `slots.length` dominance bound (third test fails: `minFill` is not greater).
  Commit: `git add apps/api/src/modules/planning/solver-model.spec.ts && git commit -m "test(KON-135): RED — shift spread, survivor fixed, fill dominance"`

- [ ] **Task 4 — GREEN: model the third spread, survivor baseline, and dominance bound** [AC: 2, 3]

  In `apps/api/src/modules/planning/solver-model.ts`, add `EmployeeLoad` to the `local-repair` import (currently at :23):

  ```ts
  import type { EquityWeights, EmployeeLoad } from './local-repair';
  ```

  Add the `fixedEquityLoads` field to `SolverInput`, right after the `fixedMonthlyMinutes` line you added in Task 2:

  ```ts
    /** employeeId -> fixed net minutes already worked THIS month (survivors) — deducted from the monthly cap, the exact mirror of fixedWeeklyMinutes (Story 13-5, T5). */
    fixedMonthlyMinutes: Map<string, number>;
    /** employeeId -> survivor equity load (saturday/weekend/shift counts) — the per-metric spread baseline, so the spread reflects TOTAL fairness the survivor-aware gate judges (Story 13-5, T7). */
    fixedEquityLoads: Map<string, EmployeeLoad>;
  ```

  Then replace the entire objective/spread block (currently at :368-414, from the `// Objective:` comment through the closing `}` of the `for (const spread of activeSpreads)` loop):

  ```ts
    // Objective: fill lexicographically dominates the weighted equity spreads.
    // The three spread metrics mirror equityObjective (local-repair.ts) EXACTLY —
    // saturday, weekend AND shift — so the solver optimizes every metric the
    // service's acceptance gate judges (Story 13-5, T7a). Each per-employee count
    // carries a `fixed` survivor baseline (that employee's immovable MANUAL/confirmed
    // load for the metric), so the spread reflects TOTAL fairness the same way the
    // survivor-aware gate does — the model no longer balances only what it can move.
    const w = input.equityWeights;
    const spreadDefs: Array<{
      tag: string;
      isoDays: number[];
      weight: number;
      metric: keyof EmployeeLoad;
    }> = [
      {
        tag: 'spread:saturday',
        isoDays: [6],
        weight: w.saturday,
        metric: 'saturdayCount',
      },
      {
        tag: 'spread:weekend',
        isoDays: [6, 7],
        weight: w.weekend,
        metric: 'weekendCount',
      },
      {
        tag: 'spread:shift',
        isoDays: [1, 2, 3, 4, 5, 6, 7],
        weight: w.shift,
        metric: 'shiftCount',
      },
    ];
    const activeSpreads: IrSpread[] = [];
    for (const def of spreadDefs) {
      const perEmployee = employees
        .map((e) => {
          const ev = varsByEmployee.get(e.id) ?? [];
          const terms = ev
            .filter((v) =>
              def.isoDays.includes(isoWeekday(slotById.get(v.slotId)!.date)),
            )
            .map((v) => ({ varName: v.name, coeff: 1 }));
          const fixed = input.fixedEquityLoads.get(e.id)?.[def.metric] ?? 0;
          return { employeeId: e.id, terms, fixed };
        })
        // Keep an employee whose only contribution is a survivor baseline: a
        // `fixed > 0` with no free term still shifts the spread, so the model must
        // see it to balance TOTAL load (the survivor-aware gate does).
        .filter((p) => p.terms.length > 0 || p.fixed > 0);
      if (perEmployee.length < 2) continue;
      activeSpreads.push({ kind: 'spread', tag: def.tag, perEmployee });
    }

    const totalSpreadWeight = spreadDefs.reduce(
      (s, d) => s + Math.ceil(d.weight * 100),
      0,
    );
    // Fill must beat any weighted spread swing. A survivor `fixed` can push a
    // per-employee count past slots.length, so the dominance bound tracks the
    // largest achievable spread across active defs, not just the slot count
    // (Story 13-5, AC-3) — otherwise a heavy survivor imbalance could let the
    // optimizer trade a filled position for fairness.
    const maxSpread = Math.max(
      slots.length,
      0,
      ...activeSpreads.map((sp) =>
        Math.max(...sp.perEmployee.map((p) => p.terms.length + p.fixed)),
      ),
    );
    const fillWeight = totalSpreadWeight * (maxSpread + 1);

    const objective: IrObjectiveTerm[] = vars.map((v) => ({
      tag: 'fill',
      varName: v.name,
      weight: fillWeight,
    }));
    for (const spread of activeSpreads) {
      constraints.push(spread);
      const def = spreadDefs.find((d) => d.tag === spread.tag)!;
      objective.push({
        tag: spread.tag,
        varName: spread.tag, // the adapter materializes the spread var under its tag name
        weight: -Math.ceil(def.weight * 100),
      });
    }
  ```

  Run: `pnpm --filter @pawly/api test solver-model`
  Expected: GREEN — all solver-model tests pass, including the three from Task 3. No adapter change needed (`solver-engine.service.ts:133-147` already reads `p.fixed`).
  Commit: `git add apps/api/src/modules/planning/solver-model.ts && git commit -m "feat(KON-135): model shift spread + survivor baseline, keep fill dominant (T7)"`

- [ ] **Task 5 — GREEN: wire the baseline + survivor-aware gate in the service** [AC: 1, 2]

  All edits in `apps/api/src/modules/planning/planning-generation.service.ts`.

  **(a)** Add `EmployeeLoad` to the `local-repair` import (currently :37-45):

  ```ts
  import {
    computeLoads,
    deriveEquityWeights,
    equityObjective,
    findEjectionChain,
    selectImprovingSwap,
    type RepairSlot,
    type RepairAssignment,
    type EmployeeLoad,
  } from './local-repair';
  ```

  **(b)** In the `solverBaseline` block (currently :533-551), add the monthly-minutes snapshot and the survivor equity loads. Replace the whole `const solverBaseline = ...` assignment:

  ```ts
      // Story 12-1 (KON-129) — freeze the pre-greedy fixed baseline (border +
      // survivors + school) so the solver's model re-decides GENERATED assignments
      // only. Captured ONLY on the cpsat path: the default engine pays nothing.
      // Story 13-5 adds the monthly-minute baseline (employeeMinutes is seeded with
      // this month's survivors above; border shifts never enter it — exactly the
      // per-month figure the monthly cap must deduct) and the survivor equity loads
      // the spread + gate use.
      const solverBaseline =
        options.engine === 'cpsat'
          ? {
              weeklyMinutes: new Map(weeklyMinutesCounter),
              monthlyMinutes: new Map(employeeMinutes),
              equityLoads: (() => {
                const survSlotById = new Map<string, RepairSlot>();
                const survAssignments: RepairAssignment[] = [];
                survivingShifts.forEach((ss, i) => {
                  const id = `surv|${i}`;
                  survSlotById.set(id, {
                    id,
                    date: ss.date,
                    shiftTypeCode: ss.shiftTypeCode,
                    startTime: ss.startTime,
                    endTime: ss.endTime,
                    breakMinutes: ss.breakMinutes ?? 0,
                  });
                  survAssignments.push({ slotId: id, employeeId: ss.employeeId });
                });
                return computeLoads(survAssignments, survSlotById);
              })(),
              fixedShiftsByEmployee: (() => {
                const byEmp = new Map<string, AssignedShift[]>();
                for (const bucket of assignmentIndex.values()) {
                  for (const s of bucket) {
                    if (!byEmp.has(s.employeeId)) byEmp.set(s.employeeId, []);
                    byEmp.get(s.employeeId)!.push(s);
                  }
                }
                return byEmp;
              })(),
              rotationCounts: new Map(
                [...dayOfWeekCounts.entries()].map(([k, v]) => [k, new Map(v)]),
              ),
            }
          : null;
  ```

  **(c)** In `runSolverImprovePass`, extend the `baseline` param type (currently :4251-4255). Replace that object type:

  ```ts
      baseline: {
        weeklyMinutes: Map<string, number>;
        monthlyMinutes: Map<string, number>;
        equityLoads: Map<string, EmployeeLoad>;
        fixedShiftsByEmployee: Map<string, AssignedShift[]>;
        rotationCounts: Map<string, Map<number, number>>;
      };
  ```

  **(d)** In the `SolverInput` construction (currently :4402-4424), add the two new maps. Replace the `fixedWeeklyMinutes: ctx.baseline.weeklyMinutes,` line:

  ```ts
        fixedWeeklyMinutes: ctx.baseline.weeklyMinutes,
        fixedMonthlyMinutes: ctx.baseline.monthlyMinutes,
        fixedEquityLoads: ctx.baseline.equityLoads,
  ```

  **(e)** Make the acceptance gate survivor-aware (currently the two `equityObjective(...)` assignments at :4476-4483). Replace both:

  ```ts
      // Story 13-5 (T7) — the gate judges TOTAL fairness (survivors + generated),
      // matching the survivor-aware spread the model now optimizes. Each employee's
      // immovable survivor load is added to BOTH plans, so the comparison stays a
      // strict apples-to-apples improvement test while "fairer" means fairer in
      // reality, not just across the shifts the pass can move.
      const withSurvivors = (
        generated: Map<string, EmployeeLoad>,
      ): Map<string, EmployeeLoad> => {
        const merged = new Map<string, EmployeeLoad>();
        for (const [empId, l] of ctx.baseline.equityLoads) {
          merged.set(empId, { ...l });
        }
        for (const [empId, l] of generated) {
          const cur = merged.get(empId) ?? {
            saturdayCount: 0,
            weekendCount: 0,
            shiftCount: 0,
          };
          merged.set(empId, {
            saturdayCount: cur.saturdayCount + l.saturdayCount,
            weekendCount: cur.weekendCount + l.weekendCount,
            shiftCount: cur.shiftCount + l.shiftCount,
          });
        }
        return merged;
      };
      const greedyEquity = equityObjective(
        withSurvivors(
          computeLoads(toRepairAssignments(ctx.assignedShifts), repairSlotById),
        ),
        equityWeights,
      );
      const candidateEquity = equityObjective(
        withSurvivors(
          computeLoads(toRepairAssignments(candidate), repairSlotById),
        ),
        equityWeights,
      );
  ```

  Run: `pnpm --filter @pawly/api test planning-generation.service`
  Expected: GREEN — the existing `cp-sat improve pass (KON-129)` suite stays green (its fixtures carry no survivors, so `equityLoads`/`monthlyMinutes` are empty → behaviour is unchanged there).
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-135): wire monthly + survivor equity baseline, survivor-aware gate"`

- [ ] **Task 6 — RED→GREEN: survivors + monthly cap serve cpsat (AC-4)** [AC: 4]

  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add a dedicated fixture + tests inside the `describe('cp-sat improve pass (KON-129)', ...)` block, after the existing AC6 tests. The fixture gives `emp-1` one in-month MANUAL survivor SURGERY (08:00→12:00 = 240 net) on Monday 2026-03-02 under an 8h/month cap; the survivor query is keyed on its `where.OR` shape so it never bleeds into the border-week `findMany` (Epic 11 mock lesson).

  ```ts
  // ─── Story 13-5 (KON-135) — solver model fidelity (T5 + T7) ────────────────
  // A survivor consumes part of a tight monthly cap. Before the fix the model
  // searched the RAW cap (480), so its optimum tripped the real cap on replay and
  // the plan fell back to greedy. After the fix the bound is cap − survivor (240)
  // and the shift spread carries the survivor's load — the model the service hands
  // the solver proves both.
  const buildSurvivorMonthlyCapExample = () => {
    mockTemplateService.getTemplateById.mockResolvedValue({
      id: 'tpl-kon-135',
      name: 'Monday VET surgery',
      clinicId,
      data: {
        days: [
          {
            dayOfWeek: 1,
            slots: [
              {
                shiftTypeCode: 'SURGERY',
                requiredStaff: 1,
                requiredJobTypes: ['VET'],
              },
            ],
          },
        ],
      },
    });
    mockClinicService.getOperationalConfig.mockResolvedValue({
      ...mockOperationalConfig,
      closedDays: [],
    });
    mockPrismaService.employee.findMany.mockResolvedValue([
      { id: 'emp-1', firstName: 'Alice', lastName: 'Martin', jobType: 'VET', contractHours: 35 },
      { id: 'emp-2', firstName: 'Bob', lastName: 'Dupont', jobType: 'VET', contractHours: 35 },
    ]);
    mockPlanningService.listRules.mockResolvedValue([
      {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Max 8h/month',
        category: 'CONTRACT_COMPLIANCE',
        ruleType: 'HARD',
        config: { maxMonthlyHours: 8, overtimeThresholdPercent: 0 },
        priority: 10,
      },
    ]);
    mockPrismaService.unavailability.findMany.mockResolvedValue([]);
    // The survivor query carries the OR predicate (source/isConfirmed/variance);
    // border-week loads do not. Key on it so the survivor never leaks into a
    // border findMany (Epic 11 shared-mock lesson).
    mockPrismaService.shift.findMany.mockImplementation(
      ({ where }: { where?: { OR?: unknown } }) =>
        where?.OR
          ? Promise.resolve([
              {
                employeeId: 'emp-1',
                date: new Date('2026-03-02'),
                startTime: '08:00',
                endTime: '12:00',
                shiftTypeCode: 'SURGERY',
                breakMinutes: 0,
                isConfirmed: true,
                source: 'MANUAL',
                employee: { jobType: 'VET' },
              },
            ])
          : Promise.resolve([]),
    );
    mockPrismaService.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $executeRaw: jest.fn().mockResolvedValue(0),
          shift: {
            findMany: jest.fn().mockResolvedValue([]),
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createManyAndReturn: jest
              .fn()
              .mockImplementation(({ data }: { data: any[] }) =>
                data.map((d, i) => ({ id: `gen-${i}`, ...d })),
              ),
          },
        }),
    );
  };

  it('AC-4 — the survivor baseline + shift spread reach the model the solver receives', async () => {
    const solveSpy = jest.spyOn(solverEngine, 'solve');
    buildSurvivorMonthlyCapExample();
    await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-kon-135', {
      engine: 'cpsat',
    });

    expect(solveSpy).toHaveBeenCalled();
    const model = solveSpy.mock.calls[0][0];

    // T5 — Alice's monthly bound is the 8h cap (480) minus her 4h survivor (240).
    const monthly = model.constraints.find(
      (c) => c.kind === 'linearLe' && c.tag === 'monthly:emp-1',
    );
    expect(monthly).toBeDefined();
    expect(monthly!.kind === 'linearLe' && monthly!.bound).toBe(480 - 240);

    // T7a — the objective now carries a shift-spread term.
    expect(model.objective.some((t) => t.tag === 'spread:shift')).toBe(true);

    // T7b — her survivor SURGERY is one Monday shift, so the shift-spread fixed
    // baseline is 1, not 0.
    const shiftSpread = model.constraints.find(
      (c) => c.kind === 'spread' && c.tag === 'spread:shift',
    );
    const alice =
      shiftSpread?.kind === 'spread'
        ? shiftSpread.perEmployee.find((p) => p.employeeId === 'emp-1')
        : undefined;
    expect(alice?.fixed).toBe(1);
  });

  it('AC-4 — serves a cpsat plan on the survivor + monthly-cap fixture', async () => {
    buildSurvivorMonthlyCapExample();
    const result = await service.generateMonthlyPlan(
      clinicId,
      '2026-03',
      'tpl-kon-135',
      { enableRepair: false, engine: 'cpsat' },
    );
    // With the deducted bound the solver's optimum survives replay and is served.
    expect(result.stats.engine).toBe('cpsat');
    expect(result.stats.holeCount).toBe(0);
  });

  it('AC-4 — two cpsat runs on the survivor fixture are deep-equal (determinism)', async () => {
    buildSurvivorMonthlyCapExample();
    const a = await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-kon-135', {
      enableRepair: false,
      engine: 'cpsat',
    });
    buildSurvivorMonthlyCapExample();
    const b = await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-kon-135', {
      enableRepair: false,
      engine: 'cpsat',
    });
    expect(a.assignments).toEqual(b.assignments);
    expect(a.stats).toEqual(b.stats);
  });
  ```

  Run: `pnpm --filter @pawly/api test planning-generation.service -t "Story 13-5|survivor + monthly-cap|survivor baseline"`
  Expected: the model-inspection test is the reliable GREEN (it asserts the built model directly). If the end-to-end `serves a cpsat plan` test does not flip on the first run, tune the fixture numerics (survivor minutes / cap / slot count) against the real solver at GREEN — see Dev Notes § "AC-4 end-to-end". The full command below must end green before Task 7.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-135): survivors + monthly cap serve cpsat (AC-4)"`

- [ ] **Task 7 — Full suite + type check + final commit** [AC: 1, 2, 3, 4]

  Run the full API suite and a type check (the service now provides the two new required `SolverInput` fields — `tsc` is the gate that proves the contract is wired, since Jest transpiles per-file without cross-file type-checking):

  ```bash
  pnpm --filter @pawly/api test
  pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json
  ```

  Run: `pnpm --filter @pawly/api test`
  Expected: all API suites green (`Test Suites: <n> passed`). `tsc --noEmit` reports **no new** errors in `solver-model.ts` / `planning-generation.service.ts` (pre-existing spec-only strictness errors documented by Story 13-3 may remain in untouched files).
  Commit: `git add -p apps/api/src/modules/planning/ && git commit -m "chore(KON-135): solver model fidelity — full suite green"` (only if uncommitted formatting/lint fixes remain; otherwise skip).

## Dev Notes

### Existing code at write time (verbatim — verify before editing)

`apps/api/src/modules/planning/solver-model.ts:55-70` (current `SolverInput`):
```ts
export interface SolverInput {
  employees: SolverEmployee[];
  slots: SolverSlot[];
  /** employeeId -> Set<'YYYY-MM-DD'> (vacation, sick, school, other). */
  unavailable: Map<string, Set<string>>;
  /** `${employeeId}|${isoWeekMonday}` -> fixed net minutes (border + survivors + school). */
  fixedWeeklyMinutes: Map<string, number>;
  /** `${employeeId}|${date}` -> fixed net minutes that day (survivors). */
  fixedDailyMinutes: Map<string, number>;
  /** employeeId -> Set<'YYYY-MM-DD'> of days already worked (survivors/border) — feeds consecutive-days. */
  fixedWorkedDates: Map<string, Set<string>>;
  /** `${employeeId}|${targetIsoDay}` -> historical count for HARD rotation. */
  fixedRotationCounts: Map<string, number>;
  rotationRules: SolverRotationRule[];
  equityWeights: EquityWeights;
}
```

`apps/api/src/modules/planning/solver-model.ts:281-292` (current monthly cap — the T5 bug: raw `bound`, no baseline, unlike the weekly cap at :272-278 which does `Math.max(0, e.weeklyCapMinutes - fixed)`):
```ts
    // Monthly cap when configured.
    if (e.monthlyCapMinutes !== null) {
      constraints.push({
        kind: 'linearLe',
        tag: `monthly:${e.id}`,
        terms: evSlots.map(({ v, s }) => ({
          varName: v.name,
          coeff: netMinutes(s),
        })),
        bound: e.monthlyCapMinutes,
      });
    }
```

`apps/api/src/modules/planning/solver-model.ts:372-390` (current spreads — the T7 bug: only saturday/weekend, `fixed: 0`):
```ts
  const spreadDefs: Array<{ tag: string; isoDays: number[]; weight: number }> =
    [
      { tag: 'spread:saturday', isoDays: [6], weight: w.saturday },
      { tag: 'spread:weekend', isoDays: [6, 7], weight: w.weekend },
    ];
  const maxSpread = slots.length;
  const activeSpreads: IrSpread[] = [];
  for (const def of spreadDefs) {
    const perEmployee = employees
      .map((e) => {
        const ev = varsByEmployee.get(e.id) ?? [];
        const terms = ev
          .filter((v) =>
            def.isoDays.includes(isoWeekday(slotById.get(v.slotId)!.date)),
          )
          .map((v) => ({ varName: v.name, coeff: 1 }));
        return { employeeId: e.id, terms, fixed: 0 };
      })
      .filter((p) => p.terms.length > 0);
    if (perEmployee.length < 2) continue;
    activeSpreads.push({ kind: 'spread', tag: def.tag, perEmployee });
  }
```

`apps/api/src/modules/planning/local-repair.ts:49-54` (the `EmployeeLoad` shape the spread `fixed` and the gate use):
```ts
export interface EmployeeLoad {
  saturdayCount: number;
  weekendCount: number;
  shiftCount: number;
}
```

`apps/api/src/modules/planning/planning-generation.service.ts:4476-4488` (current gate — survivor-blind: `computeLoads` over generated-only `assignedShifts` / `candidate`):
```ts
    const greedyEquity = equityObjective(
      computeLoads(toRepairAssignments(ctx.assignedShifts), repairSlotById),
      equityWeights,
    );
    const candidateEquity = equityObjective(
      computeLoads(toRepairAssignments(candidate), repairSlotById),
      equityWeights,
    );
    const greedyFilled = ctx.assignedShifts.length;
    const strictlyBetter =
      candidate.length > greedyFilled ||
      (candidate.length === greedyFilled &&
        candidateEquity < greedyEquity - 1e-9);
```

`apps/api/src/modules/planning/solver-engine.service.ts:131-147` (the adapter — already consumes `p.fixed`, so NO adapter change is needed):
```ts
        // spread: target (named by tag) == max(counts) - min(counts).
        const upper = Math.max(
          ...c.perEmployee.map((p) => p.terms.length + p.fixed),
        );
        const counts = c.perEmployee.map((p, idx) => {
          const count = cp.newIntVar(0, upper, `${c.tag}:cnt:${idx}`);
          cp.addEquality(
            count,
            LinearExpr.weightedSum(
              [
                ...p.terms.map((t) => assignmentVars.get(t.varName)!),
                cp.newConstant(1),
              ],
              [...p.terms.map((t) => t.coeff), p.fixed],
            ),
          );
          return count;
        });
```

### File decisions (3-bullet map)

**`apps/api/src/modules/planning/solver-model.ts`** (modify)
- *Responsibility:* unchanged — the pure, package-agnostic CP-SAT IR builder. Gains a monthly baseline deduction and a faithful three-metric equity spread.
- *Inputs:* adds the `EmployeeLoad` type from `./local-repair`; two new `SolverInput` maps (`fixedMonthlyMinutes`, `fixedEquityLoads`) supplied by the service.
- *Outputs:* same `SolverModel` shape. The `monthly:` bound now deducts survivors; the objective gains `spread:shift`; each spread's `perEmployee.fixed` carries survivor load; `maxSpread` grows to preserve fill dominance.

**`apps/api/src/modules/planning/solver-model.spec.ts`** (modify)
- *Responsibility:* unchanged — IR-shape assertions on `model.constraints` / `model.objective`. Gains the monthly-deduction, shift-spread, survivor-fixed and fill-dominance cases.
- *Inputs:* its `emp` / `slot` / `baseInput` factories (baseInput gains the two new required maps).
- *Outputs:* Jest suite. No solver run — pure model-shape assertions.

**`apps/api/src/modules/planning/planning-generation.service.ts`** (modify)
- *Responsibility:* unchanged — cpsat orchestration. Freezes the monthly-minute + survivor-equity baseline pre-greedy, wires both into `SolverInput`, and makes the acceptance gate judge survivor-aware fairness.
- *Inputs:* adds the `EmployeeLoad` type; reuses `computeLoads` over `survivingShifts` for the equity baseline and the pre-greedy `employeeMinutes` snapshot for the monthly baseline.
- *Outputs:* same `GenerationResult`. Changes bite only on the cpsat path with in-month survivors.

**`apps/api/src/modules/planning/planning-generation.service.spec.ts`** (modify)
- *Responsibility:* unchanged — behavioural suite. Gains the survivor + monthly-cap fixture and the AC-4 model-inspection / end-to-end / determinism tests.
- *Inputs:* the `mockTemplateService` / `mockClinicService` / `mockPlanningService` / `mockPrismaService` doubles and `mockOperationalConfig`, following the `buildDepth3CounterExample` shape.
- *Outputs:* Jest suite. New tests live inside the existing `cp-sat improve pass (KON-129)` describe — no new harness.

### Architecture & invariants

- **Mirror the weekly pattern, don't invent one.** The weekly cap already deducts a fixed baseline (`solver-model.ts:272-278`); the monthly cap is the same shape with the same clamp. The service already captures a weekly baseline snapshot (`weeklyMinutes: new Map(weeklyMinutesCounter)`); the monthly baseline is the sibling snapshot `new Map(employeeMinutes)` taken at the same pre-greedy point.
- **`employeeMinutes` is the correct monthly source.** It is seeded with **this month's survivors** before the greedy loop (`:476-479`); border shifts feed only `weeklyMinutesCounter`, never `employeeMinutes` (`:433-436` comment). So the pre-greedy `employeeMinutes` snapshot is exactly the in-month survivor minutes the monthly cap must deduct — no month-filtering needed.
- **Survivor equity loads come from `survivingShifts` (in-month only), via `computeLoads`.** Do NOT derive them from `fixedShiftsByEmployee`, which also holds adjacent-month **border** shifts that must not count toward this month's fairness. `computeLoads` reuses `slotContribution` (UTC weekday) — the single source of truth for saturday/weekend/shift classification (invariant 8, UTC everywhere).
- **Survivor-aware BOTH sides (Option A, locked with Alex).** The spread `fixed` and the gate merge use the SAME `ctx.baseline.equityLoads`, so the model proxy and the acceptance gate judge the same survivor-aware objective. `local-repair.ts`'s pure `equityObjective` / `computeLoads` are unchanged — only the gate's *call site* merges survivors in.
- **Fill still dominates (invariant 1 / AC-3).** `fillWeight = totalSpreadWeight * (maxSpread + 1)`; `maxSpread` must be ≥ the largest per-employee `terms.length + fixed` across active spreads, or a big survivor imbalance could make a weighted spread exceed the slot count and break dominance. The fill-dominance unit test computes that bound from the model itself.
- **Determinism (invariant 2).** No new RNG, no wall-clock. `computeLoads` iterates the same sorted structures; `survivingShifts` order is stable; the solver seed/budget are untouched. Two builds of the same input stay deep-equal.
- **Blast radius.** With no in-month survivors, `fixedMonthlyMinutes` and `fixedEquityLoads` are empty → the monthly bound and every spread `fixed` are byte-identical to today, and the survivor-aware gate reduces to the old survivor-blind gate. The one always-on change is the added `spread:shift` term, which aligns the model to a metric the gate already judged. The default greedy engine executes zero solver code (invariant 6).

### Testing

- **API:** Jest, `*.spec.ts`, `rootDir: src`. Run one file with `pnpm --filter @pawly/api test <pattern>`; never `cd apps/api`, never bare root `pnpm test` (rtk shim breaks the root runner — project memory).
- **Why Tasks 1-4 use `test solver-model` and can't break on the service.** Jest transpiles per-file (no cross-file type-check), and `solver-model.spec.ts` imports only the solver-model graph (+ `local-repair`, `shift-interval`) — never `planning-generation.service.ts`. So adding the two required `SolverInput` fields in Tasks 2/4 does not break the solver-model run even before the service is wired in Task 5. The `tsc --noEmit` gate in Task 7 is what proves the service actually provides them.
- **Do not invent a harness.** `solver-model.spec.ts` asserts on `model.constraints` / `model.objective` via its `emp()` / `slot()` / `baseInput()` factories. The service spec drives generation through `service.generateMonthlyPlan(...)` with the `mock*` doubles; the AC-4 tests follow the `buildDepth3CounterExample` shape exactly.
- **AC-4 end-to-end (the one soft spot).** The model-inspection test (`the survivor baseline + shift spread reach the model`) is deterministic and is the reliable proof of T5+T7 — assert it first and keep it. The `serves a cpsat plan` test depends on the real solver's optimum beating greedy on the fixture; the flip is designed (a survivor eating part of a tight cap, with a reachable full assignment) but its numerics (survivor minutes, cap, employee/slot count) may need tuning at GREEN so the real solver actually serves cpsat. Tune the fixture, not the assertion — mirror the Story 13-3 precedent where fixture numbers were corrected at GREEN with Alex.
- **Mock hazard (Epic 11 lesson).** `mockPrismaService.shift.findMany` is shared between the survivor query, the statutory-window query and `loadBorderWeekShifts`. The AC-4 fixture keys its `mockImplementation` on `where.OR` (present only on the survivor query) so the survivor never leaks into a border load. If you see the survivor double-counted (e.g. its minutes appearing in a border week), that predicate key is why — do not switch to a flat `mockResolvedValue`.

### Dependencies

None added. No Prisma migration, no Trigger.dev task change, no new package. `or-tools-wasm` and `solver-engine.service.ts` are untouched — the IR changes, and the adapter already reads `p.fixed`.

### Known gaps deliberately left (report, do not fix here)

- `local-repair.ts`'s own `equityObjective` usage (the greedy repair swaps, `selectImprovingSwap`) stays survivor-blind by design (module header §213-218 — it can only move generated shifts). This story only makes the **solver gate** survivor-aware; changing greedy repair fairness is a separate concern (out of scope, would perturb the greedy path).
- The linearized max-min spread remains a *proxy* for the quadratic `equityObjective` (documented relaxation, 12-1). This story tightens the proxy (third metric + survivor baseline) so it points the same way as the gate; it does not make them identical, and it need not.
- Observability of the fallback reason (`stats.solverOutcome`, `served_engine`/`solver_status` telemetry) is Story 13-6 (T6/T11) — this story reduces *how often* cpsat falls back; 13-6 makes each fallback *visible*.

### Coordination

Story 13-5 is Wave 2, cut on top of Wave 1 (13-3 merged). It shares `planning-generation.service.ts` and `solver-model.ts` with sibling stories but on different lines (the solver improve pass + IR objective, not the manual-write guards or the overlap primitive). Whoever merges second re-runs `pnpm --filter @pawly/api test`.

### Commit prefix

`feat(KON-135): ...` / `test(KON-135): ...` / `refactor(KON-135): ...`. Stage explicit paths — never `git add .`.

## File List

- `apps/api/src/modules/planning/solver-model.ts` (modify)
- `apps/api/src/modules/planning/solver-model.spec.ts` (modify)
- `apps/api/src/modules/planning/planning-generation.service.ts` (modify)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` (modify)

## Dev Agent Record

- **Model:** {{model used}}
- **Started:** {{timestamp}}
- **Completed:** {{timestamp}}

### Summary

### Files changed

### Deviations

### Test output
