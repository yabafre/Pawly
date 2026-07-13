# Story: 12-1-cp-sat-optimal-solver — CP-SAT Optimal Solver behind the Greedy Path

**Epic:** Epic 12 — Planning Optimality (Phase 3)
**Status:** review
**Branch:** feature/KON-129-12-1-cp-sat-optimal-solver
**Ticket:** KON-129 (Linear · project Pawly · blocked by KON-128 / PR #108)
**Origin:** PRD Product Scope, Phase 3 Vision — *"AI Engine: Global optimization algorithms for complex fairness balancing."* The 2026-07-08 audit deliberately chose GRASP over CP-SAT *at Epic 11's scale and priorities* (`docs/epics-context/epic-11-context.md` § 0); this story revisits that decision as a measured, **opt-in improve pass** — never a replacement of the greedy engine.

> **Read first:** `docs/epics-context/epic-11-context.md` (invariants + 11-x outcomes) and `docs/reference/planning-algorithm-reference.md`. **Merge gate:** this branch was cut from `develop` BEFORE PR #108 (KON-128) merged — Task 1 verifies the merge; `deriveEquityWeights` / `EquityWeights` / the depth-3 `EjectionChain` shape do not exist on this branch until then.

## User Story

**As an** admin user, **I want** an exact solver to try to improve the schedule that greedy + local repair produced when I generate a month, **so that** I get a provably better plan (fill first, then weighted equity) without ever risking a worse or illegal one.

## Acceptance Criteria

1. **Given** `engine: 'cpsat'` on a month where greedy+repair strands ≥ 1 hole while a fuller feasible assignment exists, **When** generation runs, **Then** the served plan has strictly fewer holes, `stats.engine === 'cpsat'`, and every served assignment passes the existing rule-engine + statutory re-validation.
2. **Given** a generation request without `engine` (or `engine: 'greedy'`), **When** generation runs, **Then** results are identical to today's greedy+repair output, `stats.engine === 'greedy'`, and no solver code executes.
3. **Given** the solver returns TIMEOUT / INFEASIBLE / throws / produces a not-strictly-better or re-validation-failing solution, **When** generation runs with `engine: 'cpsat'`, **Then** the greedy+repair result is served unchanged, `stats.engine === 'greedy'`, and a structured warn log records the solver status and the comparison deltas (NFR3 — never silent).
4. **Given** the same inputs and `engine: 'cpsat'` twice, **Then** the two results are deep-equal (workers = 1, fixed seed, deterministic-time budget — invariant #3).
5. **Given** the 50-employee / 24-7 / 31-day stress fixture with `engine: 'cpsat'`, **Then** generation completes within the CI-aware NFR2 budget of the existing perf suite.
6. **Given** any solver solution, **Then** it never violates: unavailability, per-employee overlap, `requiredJobTypes`, HARD rotation, HARD weekly/monthly contract caps, statutory daily 10h, 13h amplitude, ≤ 6 consecutive days (all modeled); the 35h-weekly-rest constraint is deliberately relaxed in the model and enforced by re-validation — a fixture proves a rest-violating solver solution is rejected and the greedy result served.
7. **Given** the seeded dev clinic, **When** the same real month is generated via tRPC once per engine, **Then** hole counts and the weighted equity objective are compared and recorded in this story's Dev Agent Record (lesson L2 — live journey, not only unit tests).

## Tasks

- [x] **Task 1 — Merge gate: bring KON-128 into this branch** [AC: 1]

  PR #108 (KON-128) must be merged into `develop` first. Then:

  ```bash
  git fetch origin && git merge origin/develop
  rg "deriveEquityWeights" apps/api/src/modules/planning/local-repair.ts
  ```

  Expected: merge succeeds (no conflicts expected — this branch only adds the story file so far) and the `rg` prints the `export function deriveEquityWeights` line. If PR #108 is not merged yet, **HALT and ask the user** — do not re-implement the weights.

  Commit: `git add docs/stories/12-1-cp-sat-optimal-solver.md && git commit -m "docs(KON-129): story file for 12-1 cp-sat optimal solver"` (only if the story file is not yet committed; the merge itself needs no commit beyond the merge commit).

- [x] **Task 2 — Install `or-tools-wasm` and smoke-test the CP-SAT surface** [AC: 1]

  ```bash
  pnpm --filter @pawly/api add or-tools-wasm
  ```

  Create `apps/api/scripts/solver-smoke.ts`:

  ```ts
  /**
   * KON-129 smoke test — verifies the or-tools-wasm CP-SAT surface this story's
   * adapter (solver-engine.service.ts) relies on: BoolVar, linear constraints,
   * objective, workers/seed/deterministic-time params, OPTIMAL status.
   * Run once with: pnpm --filter @pawly/api exec tsx scripts/solver-smoke.ts
   */
  import { CpModel, CpSolver, CpSolverStatus } from 'or-tools-wasm';

  async function main(): Promise<void> {
    const model = new CpModel();
    const x = model.newBoolVar('x');
    const y = model.newBoolVar('y');
    const z = model.newBoolVar('z');
    // x + y + z <= 2, maximize 3x + 2y + z -> expect 5 (x=1, y=1, z=0)
    model.addLinearConstraint([x, y, z], [1, 1, 1], { max: 2 });
    model.maximize([x, y, z], [3, 2, 1]);
    const solver = new CpSolver();
    solver.parameters.numSearchWorkers = 1;
    solver.parameters.randomSeed = 12;
    solver.parameters.maxDeterministicTime = 1.0;
    const status = await solver.solve(model);
    if (status !== CpSolverStatus.OPTIMAL) throw new Error(`status=${status}`);
    const obj = solver.objectiveValue();
    if (obj !== 5) throw new Error(`objective=${obj}, expected 5`);
    console.log('SMOKE OK — OPTIMAL, objective 5');
  }
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
  ```

  Run: `pnpm --filter @pawly/api exec tsx scripts/solver-smoke.ts`
  Expected: `SMOKE OK — OPTIMAL, objective 5`, exit 0.

  **The exact class/method names above are the best-known mapping of the package's documented "Python-shaped" API (consult the package README via Context7/GitHub per lesson L4 before writing).** If the real surface differs (e.g. builder-style `model.add(expr)`), adjust the smoke script until it proves the FIVE capabilities (bool vars, weighted linear ≤ constraint, weighted maximize, workers/seed/deterministic-time, OPTIMAL detection + value extraction) — and record the corrected surface in the Dev Agent Record. **Only `solver-engine.service.ts` (Task 6) may embed package-specific calls**; every other file consumes the neutral IR from Task 4. If no working surface can be proven, HALT and surface it — the fallback plan is the Python microservice (Dev Notes § Architecture decision).

  Commit: `git add apps/api/package.json pnpm-lock.yaml apps/api/scripts/solver-smoke.ts && git commit -m "feat(KON-129): or-tools-wasm pinned + cp-sat smoke test"`

- [x] **Task 3 — RED: `solver-model.spec.ts` (pure IR builder)** [AC: 6]

  Create `apps/api/src/modules/planning/solver-model.spec.ts`:

  ```ts
  import {
    buildSolverModel,
    decodeSolution,
    type SolverInput,
    type SolverEmployee,
    type SolverSlot,
  } from './solver-model';

  const emp = (id: string, weeklyCapMinutes = 2100): SolverEmployee => ({
    id,
    jobType: 'VET',
    weeklyCapMinutes,
    monthlyCapMinutes: null,
  });

  const slot = (
    id: string,
    date: string,
    startTime = '09:00',
    endTime = '17:00',
    breakMinutes = 0,
    requiredStaff = 1,
    requiredJobTypes?: string[],
  ): SolverSlot => ({
    id,
    date,
    shiftTypeCode: 'CHIR',
    startTime,
    endTime,
    breakMinutes,
    requiredStaff,
    requiredJobTypes,
  });

  const baseInput = (over: Partial<SolverInput> = {}): SolverInput => ({
    employees: [emp('a'), emp('b')],
    slots: [slot('s1', '2026-08-03')],
    unavailable: new Map(),
    fixedWeeklyMinutes: new Map(),
    fixedDailyMinutes: new Map(),
    fixedWorkedDates: new Map(),
    fixedRotationCounts: new Map(),
    rotationRules: [],
    equityWeights: { saturday: 1, weekend: 1, shift: 1 },
    ...over,
  });

  describe('buildSolverModel — variables', () => {
    it('creates one bool var per eligible (employee, slot) pair and none for ineligible', () => {
      const input = baseInput({
        employees: [emp('a'), { ...emp('b'), jobType: 'ASV' }],
        slots: [slot('s1', '2026-08-03', '09:00', '17:00', 0, 1, ['VET'])],
        unavailable: new Map([['a', new Set(['2026-08-03'])]]),
      });
      const model = buildSolverModel(input);
      // 'a' unavailable, 'b' wrong jobType -> zero variables, slot unfillable.
      expect(model.vars).toHaveLength(0);
    });

    it('emits a per-slot fill cap of requiredStaff', () => {
      const input = baseInput({
        employees: [emp('a'), emp('b'), emp('c')],
        slots: [slot('s1', '2026-08-03', '09:00', '17:00', 0, 2)],
      });
      const model = buildSolverModel(input);
      const cap = model.constraints.find(
        (c) => c.kind === 'linearLe' && c.tag === 'fill:s1',
      );
      expect(cap).toBeDefined();
      expect(cap!.bound).toBe(2);
    });
  });

  describe('buildSolverModel — hard constraint parity (AC6)', () => {
    it('mutexes overlapping same-day slots per employee', () => {
      const input = baseInput({
        slots: [
          slot('s1', '2026-08-03', '09:00', '13:00'),
          slot('s2', '2026-08-03', '12:00', '17:00'),
        ],
      });
      const model = buildSolverModel(input);
      const mutex = model.constraints.filter(
        (c) => c.kind === 'linearLe' && c.tag.startsWith('overlap:'),
      );
      // one mutex per employee for the overlapping pair
      expect(mutex).toHaveLength(2);
      expect(mutex[0].bound).toBe(1);
    });

    it('caps weekly net minutes including the fixed baseline', () => {
      const input = baseInput({
        employees: [emp('a', 480)], // 8h/week cap
        slots: [
          slot('s1', '2026-08-03', '09:00', '17:00'), // 480 net
          slot('s2', '2026-08-05', '09:00', '17:00'), // same ISO week
        ],
        fixedWeeklyMinutes: new Map([['a|2026-08-03', 60]]), // 1h already fixed
      });
      const model = buildSolverModel(input);
      const weekly = model.constraints.find(
        (c) => c.kind === 'linearLe' && c.tag.startsWith('weekly:a'),
      );
      expect(weekly).toBeDefined();
      expect(weekly!.bound).toBe(480 - 60);
    });

    it('enforces statutory daily 10h and 13h amplitude as mutexes', () => {
      const input = baseInput({
        slots: [
          slot('s1', '2026-08-03', '06:00', '12:00'), // 360 net
          slot('s2', '2026-08-03', '14:00', '20:00'), // 360 net -> 720 > 600 daily
        ],
      });
      const model = buildSolverModel(input);
      const daily = model.constraints.filter((c) =>
        c.tag.startsWith('statutory-daily:'),
      );
      expect(daily.length).toBeGreaterThan(0);
    });

    it('enforces <= 6 consecutive worked days over a 7-day window', () => {
      const days = ['03', '04', '05', '06', '07', '08', '09'];
      const input = baseInput({
        slots: days.map((d) => slot(`s${d}`, `2026-08-${d}`)),
      });
      const model = buildSolverModel(input);
      const window = model.constraints.find(
        (c) => c.kind === 'linearLe' && c.tag.startsWith('consecutive:a'),
      );
      expect(window).toBeDefined();
      expect(window!.bound).toBe(6);
    });

    it('caps HARD rotation counting fixed history', () => {
      const input = baseInput({
        slots: [
          slot('sat1', '2026-08-01'),
          slot('sat2', '2026-08-08'),
          slot('sat3', '2026-08-15'),
        ],
        rotationRules: [{ targetIsoDay: 6, maxPerPeriod: 2 }],
        fixedRotationCounts: new Map([['a|6', 1]]),
      });
      const model = buildSolverModel(input);
      const rot = model.constraints.find(
        (c) => c.kind === 'linearLe' && c.tag === 'rotation:a:6',
      );
      expect(rot).toBeDefined();
      expect(rot!.bound).toBe(1); // 2 max - 1 already in history
    });
  });

  describe('objective + decode', () => {
    it('weights fill lexicographically above the equity spread terms', () => {
      const model = buildSolverModel(baseInput());
      const fillTerms = model.objective.filter((t) => t.tag === 'fill');
      const spreadTerms = model.objective.filter((t) => t.tag !== 'fill');
      const minFill = Math.min(...fillTerms.map((t) => Math.abs(t.weight)));
      const sumSpread = spreadTerms.reduce(
        (s, t) => s + Math.abs(t.weight),
        0,
      );
      expect(minFill).toBeGreaterThan(sumSpread);
    });

    it('decodeSolution maps chosen vars back to assignments', () => {
      const input = baseInput();
      const model = buildSolverModel(input);
      const chosen = new Set(model.vars.map((v) => v.name));
      const assignments = decodeSolution(model, chosen, input);
      expect(assignments).toEqual([
        {
          employeeId: 'a',
          date: '2026-08-03',
          startTime: '09:00',
          endTime: '17:00',
          shiftTypeCode: 'CHIR',
          breakMinutes: 0,
        },
        {
          employeeId: 'b',
          date: '2026-08-03',
          startTime: '09:00',
          endTime: '17:00',
          shiftTypeCode: 'CHIR',
          breakMinutes: 0,
        },
      ]);
    });

    it('is deterministic — two builds produce identical IR', () => {
      const input = baseInput();
      expect(buildSolverModel(input)).toEqual(buildSolverModel(input));
    });
  });
  ```

  Run: `pnpm --filter @pawly/api test solver-model`
  Expected: suite fails to resolve `./solver-model` (module does not exist yet) — that is the RED witness. Emit `Confirmed RED: solver-model.spec.ts failed — Cannot find module './solver-model'`.

  Commit: `git add apps/api/src/modules/planning/solver-model.spec.ts && git commit -m "test(KON-129): RED — solver IR builder spec"`

- [x] **Task 4 — GREEN: `solver-model.ts` (pure, package-agnostic IR)** [AC: 6]

  Create `apps/api/src/modules/planning/solver-model.ts`:

  ```ts
  /**
   * Pure CP-SAT model builder — Story 12-1 (KON-129).
   *
   * Builds a NEUTRAL intermediate representation (IR) of the monthly assignment
   * problem: boolean vars per eligible (employee, slot-position-group), weighted
   * linear <= constraints, and a lexicographic linear objective (fill >> equity
   * spread). The IR is package-agnostic on purpose: only solver-engine.service.ts
   * knows or-tools-wasm, so a solver swap (e.g. Python microservice) never touches
   * this file or its tests. Same purity discipline as rule-engine.ts / local-repair.ts:
   * no NestJS, no Prisma, no I/O, no RNG, deterministic iteration order.
   *
   * Model relaxations (documented, AC6): the 35h-weekly-rest statutory rule is NOT
   * modeled (a necessary-condition — at least one fully-off calendar day per ISO
   * week — is); the exact check runs at re-validation in the service, which rejects
   * and falls back. The greedy ROTATION_EQUITY relaxation fallback is not modeled
   * either: the solver leaves such slots empty, and the strictly-better acceptance
   * gate keeps the greedy result whenever relaxation filled more positions.
   *
   * Equity in the objective is a LINEARIZED proxy (per-metric max-min spread,
   * weighted by the KON-128 EquityWeights); the exact quadratic normalized
   * objective is only used by the service's acceptance gate via equityObjective().
   */
  import type { EquityWeights } from './local-repair';

  export interface SolverEmployee {
    id: string;
    jobType: string;
    weeklyCapMinutes: number;
    monthlyCapMinutes: number | null;
  }

  export interface SolverSlot {
    id: string; // deterministic `${date}|${shiftTypeCode}|${startTime}`
    date: string; // 'YYYY-MM-DD'
    shiftTypeCode: string;
    startTime: string; // 'HH:MM'
    endTime: string;
    breakMinutes: number;
    requiredStaff: number;
    requiredJobTypes?: string[];
  }

  export interface SolverRotationRule {
    targetIsoDay: number; // 1..7
    maxPerPeriod: number;
  }

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

  export interface IrVar {
    /** `${employeeId}@${slotId}` */
    name: string;
    employeeId: string;
    slotId: string;
  }

  export interface IrLinearLe {
    kind: 'linearLe';
    tag: string;
    terms: Array<{ varName: string; coeff: number }>;
    bound: number;
  }

  export interface IrIntSpread {
    /** target = max(counts) - min(counts) over per-employee weighted sums. */
    kind: 'spread';
    tag: string;
    /** employeeId -> terms contributing to that employee's count (+ fixed offset). */
    perEmployee: Array<{
      employeeId: string;
      terms: Array<{ varName: string; coeff: number }>;
      fixed: number;
    }>;
  }

  export type IrConstraint = IrLinearLe | IrIntSpread;

  export interface IrObjectiveTerm {
    /** 'fill' for assignment vars (maximize), or the spread tag (minimize -> negative weight on the spread var). */
    tag: string;
    varName: string;
    weight: number;
  }

  export interface SolverModel {
    vars: IrVar[];
    constraints: IrConstraint[];
    objective: IrObjectiveTerm[];
  }

  const STATUTORY_DAILY_MINUTES = 600; // L.3121-18, mirrors FRENCH_LABOR_LAW
  const STATUTORY_AMPLITUDE_MINUTES = 780;
  const MAX_CONSECUTIVE_DAYS = 6;

  function toMin(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function netMinutes(s: SolverSlot): number {
    const raw = toMin(s.endTime) - toMin(s.startTime);
    const span = raw <= 0 ? raw + 1440 : raw; // overnight wrap
    return Math.max(0, span - s.breakMinutes);
  }

  function isoWeekday(dateISO: string): number {
    const dow = new Date(`${dateISO}T00:00:00.000Z`).getUTCDay();
    return dow === 0 ? 7 : dow;
  }

  /** Monday of the ISO week of a date, as 'YYYY-MM-DD' (UTC arithmetic). */
  function isoWeekMonday(dateISO: string): string {
    const d = new Date(`${dateISO}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - (isoWeekday(dateISO) - 1));
    return d.toISOString().slice(0, 10);
  }

  function addDays(dateISO: string, n: number): string {
    const d = new Date(`${dateISO}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function overlaps(a: SolverSlot, b: SolverSlot): boolean {
    if (a.date !== b.date) return false;
    return toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);
  }

  function amplitudeExceeded(a: SolverSlot, b: SolverSlot): boolean {
    if (a.date !== b.date) return false;
    const span =
      Math.max(toMin(a.endTime), toMin(b.endTime)) -
      Math.min(toMin(a.startTime), toMin(b.startTime));
    return span > STATUTORY_AMPLITUDE_MINUTES;
  }

  function varName(employeeId: string, slotId: string): string {
    return `${employeeId}@${slotId}`;
  }

  export function buildSolverModel(input: SolverInput): SolverModel {
    const employees = [...input.employees].sort((a, b) => a.id.localeCompare(b.id));
    const slots = [...input.slots].sort((a, b) => a.id.localeCompare(b.id));

    const vars: IrVar[] = [];
    const varsByEmployee = new Map<string, IrVar[]>();
    const varsBySlot = new Map<string, IrVar[]>();
    for (const e of employees) {
      for (const s of slots) {
        if (input.unavailable.get(e.id)?.has(s.date)) continue;
        if (s.requiredJobTypes?.length && !s.requiredJobTypes.includes(e.jobType))
          continue;
        const v: IrVar = { name: varName(e.id, s.id), employeeId: e.id, slotId: s.id };
        vars.push(v);
        (varsByEmployee.get(e.id) ?? varsByEmployee.set(e.id, []).get(e.id)!).push(v);
        (varsBySlot.get(s.id) ?? varsBySlot.set(s.id, []).get(s.id)!).push(v);
      }
    }

    const constraints: IrConstraint[] = [];
    const slotById = new Map(slots.map((s) => [s.id, s]));

    // Fill caps: sum_e x[e,s] <= requiredStaff.
    for (const s of slots) {
      const sv = varsBySlot.get(s.id) ?? [];
      if (sv.length === 0) continue;
      constraints.push({
        kind: 'linearLe',
        tag: `fill:${s.id}`,
        terms: sv.map((v) => ({ varName: v.name, coeff: 1 })),
        bound: s.requiredStaff,
      });
    }

    for (const e of employees) {
      const ev = varsByEmployee.get(e.id) ?? [];
      if (ev.length === 0) continue;
      const evSlots = ev.map((v) => ({ v, s: slotById.get(v.slotId)! }));

      // Pairwise mutex: overlap + statutory amplitude.
      for (let i = 0; i < evSlots.length; i++) {
        for (let j = i + 1; j < evSlots.length; j++) {
          const A = evSlots[i];
          const B = evSlots[j];
          if (overlaps(A.s, B.s)) {
            constraints.push({
              kind: 'linearLe',
              tag: `overlap:${e.id}:${A.s.id}:${B.s.id}`,
              terms: [
                { varName: A.v.name, coeff: 1 },
                { varName: B.v.name, coeff: 1 },
              ],
              bound: 1,
            });
          } else if (amplitudeExceeded(A.s, B.s)) {
            constraints.push({
              kind: 'linearLe',
              tag: `statutory-amplitude:${e.id}:${A.s.id}:${B.s.id}`,
              terms: [
                { varName: A.v.name, coeff: 1 },
                { varName: B.v.name, coeff: 1 },
              ],
              bound: 1,
            });
          }
        }
      }

      // Weekly caps (net minutes, fixed baseline deducted from the bound).
      const byWeek = new Map<string, Array<{ v: IrVar; minutes: number }>>();
      for (const { v, s } of evSlots) {
        const wk = isoWeekMonday(s.date);
        (byWeek.get(wk) ?? byWeek.set(wk, []).get(wk)!).push({ v, minutes: netMinutes(s) });
      }
      for (const [wk, entries] of [...byWeek.entries()].sort()) {
        const fixed = input.fixedWeeklyMinutes.get(`${e.id}|${wk}`) ?? 0;
        constraints.push({
          kind: 'linearLe',
          tag: `weekly:${e.id}:${wk}`,
          terms: entries.map((x) => ({ varName: x.v.name, coeff: x.minutes })),
          bound: Math.max(0, e.weeklyCapMinutes - fixed),
        });
      }

      // Monthly cap when configured.
      if (e.monthlyCapMinutes !== null) {
        constraints.push({
          kind: 'linearLe',
          tag: `monthly:${e.id}`,
          terms: evSlots.map(({ v, s }) => ({ varName: v.name, coeff: netMinutes(s) })),
          bound: e.monthlyCapMinutes,
        });
      }

      // Statutory daily 10h net (fixed daily minutes deducted).
      const byDate = new Map<string, Array<{ v: IrVar; minutes: number }>>();
      for (const { v, s } of evSlots) {
        (byDate.get(s.date) ?? byDate.set(s.date, []).get(s.date)!).push({
          v,
          minutes: netMinutes(s),
        });
      }
      for (const [date, entries] of [...byDate.entries()].sort()) {
        const fixed = input.fixedDailyMinutes.get(`${e.id}|${date}`) ?? 0;
        constraints.push({
          kind: 'linearLe',
          tag: `statutory-daily:${e.id}:${date}`,
          terms: entries.map((x) => ({ varName: x.v.name, coeff: x.minutes })),
          bound: Math.max(0, STATUTORY_DAILY_MINUTES - fixed),
        });
      }

      // <= 6 consecutive worked days: for every 7-day window covering candidate days,
      // sum of day-worked indicators <= 6. Day-worked is approximated by "any slot that
      // day" via per-date OR — linearized as: window sum over per-date max <= 6 using
      // one representative constraint per window on per-date sums capped at 1 by the
      // overlap/amplitude mutexes being absent is NOT sound in general, so we emit the
      // exact form: sum over dates in window of dayWorked <= 6 where dayWorked is a
      // pseudo-var realized in the adapter as max(vars of that date) plus fixed worked
      // dates counting 1. The IR encodes it as a linearLe over PER-DATE terms with
      // coeff 1 and a marker prefix the adapter recognizes.
      const workedDates = [...byDate.keys()].sort();
      const fixedWorked = input.fixedWorkedDates.get(e.id) ?? new Set<string>();
      const allDates = [...new Set([...workedDates, ...fixedWorked])].sort();
      for (const start of allDates) {
        const window: string[] = [];
        for (let k = 0; k < 7; k++) window.push(addDays(start, k));
        const candidateDates = window.filter(
          (d) => byDate.has(d) || fixedWorked.has(d),
        );
        if (candidateDates.length <= MAX_CONSECUTIVE_DAYS) continue;
        const fixedCount = window.filter((d) => fixedWorked.has(d)).length;
        constraints.push({
          kind: 'linearLe',
          tag: `consecutive:${e.id}:${start}`,
          terms: window
            .filter((d) => byDate.has(d))
            .map((d) => ({ varName: `day:${e.id}:${d}`, coeff: 1 })),
          bound: MAX_CONSECUTIVE_DAYS - fixedCount,
        });
      }

      // Necessary condition of the 35h weekly rest: at least one fully-off calendar
      // day per ISO week that has 7 candidate worked days -> covered by the
      // consecutive window above (a 7-day window bound of 6 forces one off day).
      // The exact 35h check is enforced at re-validation (module header).

      // HARD rotation caps with history offset.
      for (const rule of input.rotationRules) {
        const targetVars = evSlots.filter(
          ({ s }) => isoWeekday(s.date) === rule.targetIsoDay,
        );
        if (targetVars.length === 0) continue;
        const fixed = input.fixedRotationCounts.get(`${e.id}|${rule.targetIsoDay}`) ?? 0;
        constraints.push({
          kind: 'linearLe',
          tag: `rotation:${e.id}:${rule.targetIsoDay}`,
          terms: targetVars.map(({ v }) => ({ varName: v.name, coeff: 1 })),
          bound: Math.max(0, rule.maxPerPeriod - fixed),
        });
      }
    }

    // Objective: fill lexicographically dominates the weighted equity spreads.
    // Spread vars are bounded by the slot count, so FILL_WEIGHT = total spread
    // weight * (maxSpread + 1) guarantees strict dominance.
    const w = input.equityWeights;
    const spreadDefs: Array<{ tag: string; isoDays: number[]; weight: number }> = [
      { tag: 'spread:saturday', isoDays: [6], weight: w.saturday },
      { tag: 'spread:weekend', isoDays: [6, 7], weight: w.weekend },
    ];
    const maxSpread = slots.length;
    const totalSpreadWeight = spreadDefs.reduce(
      (s, d) => s + Math.ceil(d.weight * 100),
      0,
    );
    const fillWeight = totalSpreadWeight * (maxSpread + 1);

    const objective: IrObjectiveTerm[] = vars.map((v) => ({
      tag: 'fill',
      varName: v.name,
      weight: fillWeight,
    }));

    for (const def of spreadDefs) {
      const perEmployee = employees
        .map((e) => {
          const ev = varsByEmployee.get(e.id) ?? [];
          const terms = ev
            .filter((v) => def.isoDays.includes(isoWeekday(slotById.get(v.slotId)!.date)))
            .map((v) => ({ varName: v.name, coeff: 1 }));
          return { employeeId: e.id, terms, fixed: 0 };
        })
        .filter((p) => p.terms.length > 0);
      if (perEmployee.length < 2) continue;
      constraints.push({ kind: 'spread', tag: def.tag, perEmployee });
      objective.push({
        tag: def.tag,
        varName: def.tag, // the adapter materializes the spread var under its tag name
        weight: -Math.ceil(def.weight * 100),
      });
    }

    return { vars, constraints, objective };
  }

  /** Map the solver's chosen var names back to persistable assignments (sorted, deterministic). */
  export function decodeSolution(
    model: SolverModel,
    chosenVarNames: Set<string>,
    input: SolverInput,
  ): Array<{
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    shiftTypeCode: string;
    breakMinutes: number;
  }> {
    const slotById = new Map(input.slots.map((s) => [s.id, s]));
    return model.vars
      .filter((v) => chosenVarNames.has(v.name))
      .map((v) => {
        const s = slotById.get(v.slotId)!;
        return {
          employeeId: v.employeeId,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          shiftTypeCode: s.shiftTypeCode,
          breakMinutes: s.breakMinutes,
        };
      })
      .sort((a, b) =>
        `${a.date}|${a.startTime}|${a.employeeId}`.localeCompare(
          `${b.date}|${b.startTime}|${b.employeeId}`,
        ),
      );
  }
  ```

  Run: `pnpm --filter @pawly/api test solver-model`
  Expected: `Tests: 10 passed`, exit 0 (adjust count to the spec as written).

  Commit: `git add apps/api/src/modules/planning/solver-model.ts && git commit -m "feat(KON-129): pure CP-SAT IR builder (fill >> weighted equity spread)"`

- [x] **Task 5 — RED: adapter spec (real wasm solve on tiny fixtures)** [AC: 1, 4]

  Create `apps/api/src/modules/planning/solver-engine.service.spec.ts`:

  ```ts
  import { SolverEngineService } from './solver-engine.service';
  import { buildSolverModel } from './solver-model';
  import type { SolverInput } from './solver-model';

  // Tiny real solves — or-tools-wasm is fast enough for unit scope (<100ms each).
  describe('SolverEngineService (KON-129)', () => {
    const service = new SolverEngineService();

    const input: SolverInput = {
      employees: [
        { id: 'a', jobType: 'VET', weeklyCapMinutes: 480, monthlyCapMinutes: null },
        { id: 'b', jobType: 'VET', weeklyCapMinutes: 480, monthlyCapMinutes: null },
      ],
      slots: [
        {
          id: '2026-08-03|CHIR|09:00',
          date: '2026-08-03',
          shiftTypeCode: 'CHIR',
          startTime: '09:00',
          endTime: '17:00',
          breakMinutes: 0,
          requiredStaff: 1,
        },
        {
          id: '2026-08-05|CHIR|09:00',
          date: '2026-08-05',
          shiftTypeCode: 'CHIR',
          startTime: '09:00',
          endTime: '17:00',
          breakMinutes: 0,
          requiredStaff: 1,
        },
      ],
      unavailable: new Map([['b', new Set(['2026-08-05'])]]),
      fixedWeeklyMinutes: new Map(),
      fixedDailyMinutes: new Map(),
      fixedWorkedDates: new Map(),
      fixedRotationCounts: new Map(),
      rotationRules: [],
      equityWeights: { saturday: 1, weekend: 1, shift: 1 },
    };

    it('solves the bin-packing counter-example to full fill (a->s2, b->s1)', async () => {
      const model = buildSolverModel(input);
      const result = await service.solve(model, { deterministicTimeBudget: 1.0 });
      expect(result.status).toBe('OPTIMAL');
      const chosen = [...result.chosenVarNames].sort();
      expect(chosen).toEqual(['a@2026-08-05|CHIR|09:00', 'b@2026-08-03|CHIR|09:00']);
    });

    it('honours a solution hint without changing the optimum', async () => {
      const model = buildSolverModel(input);
      const result = await service.solve(model, {
        deterministicTimeBudget: 1.0,
        hint: new Set(['b@2026-08-03|CHIR|09:00']),
      });
      expect(result.status).toBe('OPTIMAL');
      expect(result.chosenVarNames.size).toBe(2);
    });

    it('is deterministic across two identical solves', async () => {
      const model = buildSolverModel(input);
      const r1 = await service.solve(model, { deterministicTimeBudget: 1.0 });
      const r2 = await service.solve(model, { deterministicTimeBudget: 1.0 });
      expect([...r1.chosenVarNames].sort()).toEqual([...r2.chosenVarNames].sort());
    });

    it('reports UNKNOWN on an exhausted deterministic budget instead of throwing', async () => {
      const model = buildSolverModel(input);
      const result = await service.solve(model, { deterministicTimeBudget: 1e-9 });
      expect(['OPTIMAL', 'FEASIBLE', 'UNKNOWN']).toContain(result.status);
    });
  });
  ```

  Run: `pnpm --filter @pawly/api test solver-engine`
  Expected RED: `Cannot find module './solver-engine.service'`. Emit the `Confirmed RED:` witness.

  Commit: `git add apps/api/src/modules/planning/solver-engine.service.spec.ts && git commit -m "test(KON-129): RED — solver engine adapter spec"`

- [x] **Task 6 — GREEN: `solver-engine.service.ts` (the ONLY or-tools-wasm consumer)** [AC: 1, 4]

  Create `apps/api/src/modules/planning/solver-engine.service.ts`:

  ```ts
  /**
   * or-tools-wasm CP-SAT adapter — Story 12-1 (KON-129).
   *
   * The ONLY file in the codebase that imports or-tools-wasm. Translates the neutral
   * IR (solver-model.ts) into a CpModel, solves with pinned determinism parameters
   * (numSearchWorkers=1, fixed randomSeed, maxDeterministicTime budget — never a
   * wall-clock limit, which would break run-to-run reproducibility), and returns the
   * chosen variable names. Swap plan: if or-tools-wasm proves unfit, this file is
   * replaced by an HTTP client to a Python CP-SAT microservice with the same
   * SolveResult contract — nothing else changes (Dev Notes § Architecture decision).
   *
   * API-surface note (Task 2): the exact or-tools-wasm calls below follow the
   * package's Python-shaped TypeScript API as proven by scripts/solver-smoke.ts.
   * If the smoke test required corrections, apply the SAME corrections here.
   */
  import { Injectable, Logger } from '@nestjs/common';
  import { CpModel, CpSolver, CpSolverStatus } from 'or-tools-wasm';
  import type { SolverModel } from './solver-model';

  export type SolveStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN';

  export interface SolveResult {
    status: SolveStatus;
    chosenVarNames: Set<string>;
  }

  export interface SolveOptions {
    /** CP-SAT deterministic-time budget (unitless deterministic seconds). */
    deterministicTimeBudget: number;
    /** Warm start: var names set to 1 in the hint (the greedy+repair solution). */
    hint?: Set<string>;
  }

  const RANDOM_SEED = 129; // pinned — invariant #3

  @Injectable()
  export class SolverEngineService {
    private readonly logger = new Logger(SolverEngineService.name);

    async solve(model: SolverModel, options: SolveOptions): Promise<SolveResult> {
      const cp = new CpModel();
      const varByName = new Map<string, ReturnType<CpModel['newBoolVar']>>();
      for (const v of model.vars) varByName.set(v.name, cp.newBoolVar(v.name));

      // Day-worked pseudo-vars referenced by `consecutive:` constraints (`day:{emp}:{date}`):
      // dayVar >= x for every slot var of that (employee, date) — materialized lazily.
      const ensureDayVar = (name: string) => {
        let dv = varByName.get(name);
        if (dv) return dv;
        dv = cp.newBoolVar(name);
        varByName.set(name, dv);
        const [, employeeId, date] = name.split(':');
        for (const v of model.vars) {
          if (v.employeeId !== employeeId) continue;
          if (!v.slotId.startsWith(`${date}|`)) continue;
          // x <= dayVar  <=>  x - dayVar <= 0
          cp.addLinearConstraint([varByName.get(v.name)!, dv], [1, -1], { max: 0 });
        }
        return dv;
      };

      for (const c of model.constraints) {
        if (c.kind === 'linearLe') {
          const vars = c.terms.map((t) =>
            t.varName.startsWith('day:')
              ? ensureDayVar(t.varName)
              : varByName.get(t.varName)!,
          );
          cp.addLinearConstraint(
            vars,
            c.terms.map((t) => t.coeff),
            { max: c.bound },
          );
        } else {
          // spread: materialize max/min int vars over per-employee counts.
          const counts = c.perEmployee.map((p, idx) => {
            const count = cp.newIntVar(0, p.terms.length + p.fixed, `${c.tag}:cnt:${idx}`);
            // count == sum(terms) + fixed  <=>  two inequalities via equality helper
            cp.addEquality(
              count,
              p.terms.map((t) => varByName.get(t.varName)!),
              p.terms.map((t) => t.coeff),
              p.fixed,
            );
            return count;
          });
          const upper = Math.max(...c.perEmployee.map((p) => p.terms.length + p.fixed));
          const maxVar = cp.newIntVar(0, upper, `${c.tag}:max`);
          const minVar = cp.newIntVar(0, upper, `${c.tag}:min`);
          cp.addMaxEquality(maxVar, counts);
          cp.addMinEquality(minVar, counts);
          const spreadVar = cp.newIntVar(0, upper, c.tag);
          // spread == max - min
          cp.addEquality(spreadVar, [maxVar, minVar], [1, -1], 0);
          varByName.set(c.tag, spreadVar);
        }
      }

      cp.maximize(
        model.objective.map((t) => varByName.get(t.varName)!),
        model.objective.map((t) => t.weight),
      );

      if (options.hint) {
        for (const v of model.vars) {
          cp.addHint(varByName.get(v.name)!, options.hint.has(v.name) ? 1 : 0);
        }
      }

      const solver = new CpSolver();
      solver.parameters.numSearchWorkers = 1;
      solver.parameters.randomSeed = RANDOM_SEED;
      solver.parameters.maxDeterministicTime = options.deterministicTimeBudget;

      let status: CpSolverStatus;
      try {
        status = await solver.solve(cp);
      } catch (error) {
        this.logger.warn(`CP-SAT solve threw: ${String(error)}`);
        return { status: 'UNKNOWN', chosenVarNames: new Set() };
      }

      if (
        status !== CpSolverStatus.OPTIMAL &&
        status !== CpSolverStatus.FEASIBLE
      ) {
        return {
          status: status === CpSolverStatus.INFEASIBLE ? 'INFEASIBLE' : 'UNKNOWN',
          chosenVarNames: new Set(),
        };
      }

      const chosen = new Set<string>();
      for (const v of model.vars) {
        if (solver.value(varByName.get(v.name)!) === 1) chosen.add(v.name);
      }
      return {
        status: status === CpSolverStatus.OPTIMAL ? 'OPTIMAL' : 'FEASIBLE',
        chosenVarNames: chosen,
      };
    }
  }
  ```

  Register in `apps/api/src/modules/planning/planning.module.ts`: add `SolverEngineService` to the `providers` array (alongside the existing planning providers) and export it if the module exports services.

  Run: `pnpm --filter @pawly/api test solver-engine`
  Expected: `Tests: 4 passed`, exit 0.

  Commit: `git add apps/api/src/modules/planning/solver-engine.service.ts apps/api/src/modules/planning/planning.module.ts && git commit -m "feat(KON-129): or-tools-wasm CP-SAT adapter (deterministic, hinted)"`

- [x] **Task 7 — Schema + router: opt-in `engine` flag and `stats.engine`** [AC: 2]

  In `packages/validators/src/planning/planning-generation.schema.ts`:

  1. Extend `generatePlanSchema`:

  ```ts
  export const generatePlanSchema = z.object({
    month: monthSchema,
    templateId: z.string().uuid('Template ID must be a valid UUID'),
    // Story 11-1 — bulk regeneration now honours the 7-6 published-change guard.
    acknowledgePublishedChange: z.boolean().default(false),
    // Story 12-1 (KON-129) — opt-in exact-solver improve pass. Default preserves
    // today's behavior byte-for-byte.
    engine: z.enum(['greedy', 'cpsat']).default('greedy'),
  });
  ```

  2. In `generationStatsSchema` (same file), add the field:

  ```ts
    // Story 12-1 — which engine produced the SERVED assignments ('cpsat' only when
    // the solver strictly improved on greedy+repair and re-validation passed).
    engine: z.enum(['greedy', 'cpsat']).default('greedy'),
  ```

  3. In `apps/api/src/trpc/routers/planning.router.ts`, in the `generatePlan` procedure, replace the current service call

  ```ts
        return await ctx.planningGenerationService.generateMonthlyPlan(
          ctx.user.clinicId,
          input.month,
          input.templateId,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
  ```

  with

  ```ts
        return await ctx.planningGenerationService.generateMonthlyPlan(
          ctx.user.clinicId,
          input.month,
          input.templateId,
          {
            acknowledgePublishedChange: input.acknowledgePublishedChange,
            engine: input.engine,
          },
        );
  ```

  Add a validators test in the existing schema test file (`packages/validators/src/planning/planning-generation.schema.test.ts` — same file that tests `acknowledgePublishedChange`):

  ```ts
  describe('generatePlanSchema.engine (KON-129)', () => {
    it('defaults to greedy', () => {
      const parsed = generatePlanSchema.parse({
        month: '2026-08',
        templateId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(parsed.engine).toBe('greedy');
    });
    it('accepts cpsat and rejects unknown engines', () => {
      expect(
        generatePlanSchema.parse({
          month: '2026-08',
          templateId: '123e4567-e89b-12d3-a456-426614174000',
          engine: 'cpsat',
        }).engine,
      ).toBe('cpsat');
      expect(() =>
        generatePlanSchema.parse({
          month: '2026-08',
          templateId: '123e4567-e89b-12d3-a456-426614174000',
          engine: 'simplex',
        }),
      ).toThrow();
    });
  });
  ```

  Run: `pnpm --filter @pawly/validators test planning-generation` and `pnpm --filter @pawly/api test planning.router`
  Expected: both suites green. In `apps/api/src/trpc/routers/planning.router.spec.ts`, the existing generatePlan assertion that checks the options object passed to `generateMonthlyPlan` (it currently expects `{ acknowledgePublishedChange: false }` on the default-input test) must be updated to expect `{ acknowledgePublishedChange: false, engine: 'greedy' }`.

  Commit: `git add packages/validators/src/planning/planning-generation.schema.ts packages/validators/src/planning/planning-generation.schema.test.ts apps/api/src/trpc/routers/planning.router.ts apps/api/src/trpc/routers/planning.router.spec.ts && git commit -m "feat(KON-129): engine flag (greedy|cpsat) threaded tRPC->service"`

- [x] **Task 8 — RED: service integration spec (improve / never-degrade / determinism)** [AC: 1, 2, 3, 4, 6]

  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, inside the existing `describe('local-repair pass (Story 11-9)')` block's parent scope, add a new describe. Reuse the KON-128 depth-3 fixture builder (`buildDepth3CounterExample`) — it is exactly a case where a full assignment exists; make its repair-proof variant by disabling repair:

  ```ts
    // ─── Story 12-1 (KON-129) — CP-SAT improve pass ────────────────────────────────
    describe('cp-sat improve pass (KON-129)', () => {
      it('AC1 — serves the solver plan when it strictly beats greedy+repair', async () => {
        buildDepth3CounterExample();
        // Greedy WITHOUT repair strands the third Monday; the solver must fill all 3.
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { enableRepair: false, engine: 'cpsat' },
        );
        expect(result.stats.holeCount).toBe(0);
        expect(result.stats.engine).toBe('cpsat');
      });

      it('AC2 — default engine runs zero solver code and reports greedy', async () => {
        const solveSpy = jest.spyOn(solverEngine, 'solve');
        buildDepth3CounterExample();
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          {},
        );
        expect(solveSpy).not.toHaveBeenCalled();
        expect(result.stats.engine).toBe('greedy');
      });

      it('AC3 — solver failure/timeout serves the greedy result with a visible log', async () => {
        jest
          .spyOn(solverEngine, 'solve')
          .mockResolvedValueOnce({ status: 'UNKNOWN', chosenVarNames: new Set() });
        buildDepth3CounterExample();
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { engine: 'cpsat' },
        );
        expect(result.stats.engine).toBe('greedy');
        // greedy+repair already fills this fixture (KON-128 depth-3) — unchanged result
        expect(result.stats.holeCount).toBe(0);
      });

      it('AC3 — a not-strictly-better solver plan is discarded', async () => {
        buildDepth3CounterExample();
        // With repair ON, greedy+repair already reaches 0 holes; an equal solver plan
        // must NOT flip the engine label (strictness gate).
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { engine: 'cpsat' },
        );
        expect(result.stats.holeCount).toBe(0);
        // engine may legitimately be 'cpsat' ONLY if equity strictly improved; on this
        // 3-VET fixture all full assignments have identical equity -> must stay greedy.
        expect(result.stats.engine).toBe('greedy');
      });

      it('AC4 — two cpsat runs are deep-equal', async () => {
        buildDepth3CounterExample();
        const a = await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-kon-128', {
          enableRepair: false,
          engine: 'cpsat',
        });
        buildDepth3CounterExample();
        const b = await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-kon-128', {
          enableRepair: false,
          engine: 'cpsat',
        });
        expect(a.assignments).toEqual(b.assignments);
        expect(a.holes).toEqual(b.holes);
      });

      it('AC6 — a re-validation-failing solver plan is rejected and greedy served', async () => {
        // Force the adapter to return a solution that double-books emp-1 on both
        // remaining Mondays — statutory/rule re-validation must reject it.
        jest.spyOn(solverEngine, 'solve').mockResolvedValueOnce({
          status: 'OPTIMAL',
          chosenVarNames: new Set([
            'emp-1@2026-03-02|SURGERY|09:00',
            'emp-1@2026-03-09|SURGERY|09:00',
            'emp-1@2026-03-16|SURGERY|09:00',
          ]),
        });
        buildDepth3CounterExample();
        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-kon-128',
          { engine: 'cpsat' },
        );
        expect(result.stats.engine).toBe('greedy');
      });
    });
  ```

  Wiring note for the spec: the test module must provide `SolverEngineService` (real instance) and expose it as `solverEngine` in the suite scope — add it to the `Test.createTestingModule` providers next to the existing service providers and `moduleRef.get(SolverEngineService)`.

  Run: `pnpm --filter @pawly/api test planning-generation.service`
  Expected RED: the new describe fails (`engine` option unknown, `stats.engine` undefined, `solverEngine` unresolved). Emit the `Confirmed RED:` witness with the first failing assertion.

  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-129): RED — cp-sat improve pass integration spec"`

- [x] **Task 9 — GREEN: the improve pass in `planning-generation.service.ts`** [AC: 1, 2, 3, 6]

  All edits in `apps/api/src/modules/planning/planning-generation.service.ts`:

  1. Constructor: inject the adapter (the class already injects other services — add the parameter):

  ```ts
      private readonly solverEngine: SolverEngineService,
  ```

  with `import { SolverEngineService } from './solver-engine.service';` and, at the top of the import block, `import { buildSolverModel, decodeSolution, type SolverInput } from './solver-model';`.

  2. Extend the options type of `generateMonthlyPlan` (currently `{ acknowledgePublishedChange?: boolean; enableRepair?: boolean }`):

  ```ts
      options: {
        acknowledgePublishedChange?: boolean;
        enableRepair?: boolean;
        engine?: 'greedy' | 'cpsat';
      } = {},
  ```

  3. Snapshot the fixed baseline right AFTER counter seeding (border + survivors + school) and BEFORE the greedy slot loop — locate the comment `// Story 11-9 — bounded GRASP local-repair pass` and place the snapshot capture just before the slot loop that precedes it:

  ```ts
      // Story 12-1 (KON-129) — freeze the pre-greedy fixed baseline so the solver
      // re-decides GENERATED assignments only (survivors/border/school stay fixed).
      const fixedWeeklyMinutesSnapshot = new Map(weeklyMinutesCounter);
      const fixedAssignmentSnapshot = new Map(
        [...assignmentIndex.entries()].map(([k, v]) => [k, [...v]]),
      );
  ```

  4. After the local-repair pass block (after `holes.push(...repairedHoles);`) and before the Story 11-1 published-change collection, insert the improve pass:

  ```ts
      // Story 12-1 (KON-129) — opt-in CP-SAT improve pass. Greedy+repair already ran:
      // its solution seeds the solver as a hint, and the solver result is served ONLY
      // when strictly better (fewer holes, else strictly better weighted equity) AND
      // it passes full re-validation. Never degrades, never silent (NFR3).
      if (options.engine === 'cpsat') {
        const solverStart = Date.now();
        try {
          const improved = await this.runSolverImprovePass({
            employees,
            slots,
            constraints,
            assignedShifts,
            fixedWeeklyMinutesSnapshot,
            fixedAssignmentSnapshot,
            holes,
          });
          if (improved) {
            assignedShifts.length = 0;
            assignedShifts.push(...improved.assignments);
            holes.length = 0;
            holes.push(...improved.holes);
            servedEngine = 'cpsat';
          }
        } catch (error) {
          this.logger.warn(
            `KON-129 solver pass failed after ${Date.now() - solverStart}ms — serving greedy result: ${String(error)}`,
          );
        }
      }
  ```

  with `let servedEngine: 'greedy' | 'cpsat' = 'greedy';` declared next to `generationStart`, and `engine: servedEngine` added to the returned `stats` object (locate the existing `stats: {` literal in the return and add the key).

  5. Add the private method `runSolverImprovePass` (place it directly after `runLocalRepairPass`). Its responsibilities, in order — build `SolverInput` from the generation context, solve with the greedy hint, decode, re-validate, compare:

  ```ts
    /**
     * Story 12-1 (KON-129). Returns the improved plan or null when the solver did not
     * strictly beat greedy+repair (or failed, or failed re-validation). Deterministic:
     * fixed seed/workers/deterministic-time inside SolverEngineService.
     */
    private async runSolverImprovePass(ctx: {
      employees: EmployeeInfo[];
      slots: SlotRequirement[];
      constraints: ConstraintMap;
      assignedShifts: AssignedShift[];
      fixedWeeklyMinutesSnapshot: Map<string, number>;
      fixedAssignmentSnapshot: Map<string, AssignedShift[]>;
      holes: GenerationResult['holes'];
    }): Promise<{ assignments: AssignedShift[]; holes: GenerationResult['holes'] } | null> {
      const slotId = (s: { date: string; shiftTypeCode: string; startTime: string }) =>
        `${s.date}|${s.shiftTypeCode}|${s.startTime}`;

      // 1) SolverInput from the generation context (weekly caps use the same
      //    min(contractHours, rule maxWeeklyHours) net-minute semantics as
      //    evaluateEligibility — reuse the exact helpers it uses, do not re-derive).
      const rotationRules = ctx.constraints.hardRules
        .filter((r) => r.category === 'ROTATION_EQUITY')
        .map((r) => ({
          targetIsoDay:
            PlanningGenerationService.DAY_NAME_TO_ISO[
              String(r.config.targetDay)
            ] ?? 0,
          maxPerPeriod: Number(r.config.maxPerPeriod ?? 0),
        }))
        .filter((r) => r.targetIsoDay > 0 && r.maxPerPeriod > 0);

      const input: SolverInput = {
        employees: ctx.employees.map((e) => ({
          id: e.id,
          jobType: e.jobType,
          weeklyCapMinutes: this.effectiveWeeklyCapMinutes(e, ctx.constraints),
          monthlyCapMinutes: this.effectiveMonthlyCapMinutes(e, ctx.constraints),
        })),
        slots: ctx.slots.flatMap((s) =>
          Array.from({ length: s.requiredStaff }, (_, i) => ({
            id: `${slotId(s)}#${i}`,
            date: s.date,
            shiftTypeCode: s.shiftTypeCode,
            startTime: s.startTime,
            endTime: s.endTime,
            breakMinutes: s.breakMinutes,
            requiredStaff: 1,
            requiredJobTypes: s.requiredJobTypes,
          })),
        ),
        unavailable: ctx.constraints.unavailableMap,
        fixedWeeklyMinutes: this.weeklySnapshotToSolverKeys(
          ctx.fixedWeeklyMinutesSnapshot,
        ),
        fixedDailyMinutes: this.dailyMinutesFromSnapshot(ctx.fixedAssignmentSnapshot),
        fixedWorkedDates: this.workedDatesFromSnapshot(ctx.fixedAssignmentSnapshot),
        fixedRotationCounts: this.rotationCountsFromSnapshot(
          ctx.fixedAssignmentSnapshot,
          rotationRules,
        ),
        rotationRules,
        equityWeights: deriveEquityWeights([
          ...ctx.constraints.hardRules,
          ...ctx.constraints.softRules,
        ]),
      };

      const model = buildSolverModel(input);

      // 2) Hint = the greedy+repair solution mapped onto position ids (first free position
      //    per slot key, deterministic order).
      const hint = this.greedySolutionAsHint(ctx.assignedShifts, input.slots);

      const result = await this.solverEngine.solve(model, {
        deterministicTimeBudget:
          PlanningGenerationService.SOLVER_DETERMINISTIC_BUDGET,
        hint,
      });
      if (result.status !== 'OPTIMAL' && result.status !== 'FEASIBLE') {
        this.logger.warn(`KON-129 solver status ${result.status} — keeping greedy plan`);
        return null;
      }

      const candidate = decodeSolution(model, result.chosenVarNames, input);

      // 3) Strictly-better gate on the EXACT objectives.
      const greedyFilled = ctx.assignedShifts.length;
      const greedyEquity = equityObjective(
        computeLoads(
          ctx.assignedShifts.map((s) => ({ slotId: slotId(s), employeeId: s.employeeId })),
          new Map(
            ctx.slots.map((s) => [
              slotId(s),
              {
                id: slotId(s),
                date: s.date,
                shiftTypeCode: s.shiftTypeCode,
                startTime: s.startTime,
                endTime: s.endTime,
                breakMinutes: s.breakMinutes,
                requiredJobTypes: s.requiredJobTypes,
              },
            ]),
          ),
        ),
        input.equityWeights,
      );
      const candidateEquity = equityObjective(
        computeLoads(
          candidate.map((s) => ({
            slotId: `${s.date}|${s.shiftTypeCode}|${s.startTime}`,
            employeeId: s.employeeId,
          })),
          new Map(
            ctx.slots.map((s) => [
              slotId(s),
              {
                id: slotId(s),
                date: s.date,
                shiftTypeCode: s.shiftTypeCode,
                startTime: s.startTime,
                endTime: s.endTime,
                breakMinutes: s.breakMinutes,
                requiredJobTypes: s.requiredJobTypes,
              },
            ]),
          ),
        ),
        input.equityWeights,
      );
      const strictlyBetter =
        candidate.length > greedyFilled ||
        (candidate.length === greedyFilled && candidateEquity < greedyEquity - 1e-9);
      if (!strictlyBetter) {
        this.logger.log(
          `KON-129 solver ${result.status}: filled ${candidate.length}/${greedyFilled}, equity ${candidateEquity.toFixed(4)}/${greedyEquity.toFixed(4)} — greedy kept`,
        );
        return null;
      }

      // 4) Full re-validation through the EXISTING evaluators (rule-engine + statutory,
      //    including the exact 35h weekly rest the model relaxes). Reuse the same
      //    validation entry the publish path uses on a synthetic assignment list; any
      //    violation -> reject, log, keep greedy (NFR3).
      const validationErrors = this.validateSolverCandidate(candidate, ctx);
      if (validationErrors.length > 0) {
        this.logger.warn(
          `KON-129 solver plan rejected by re-validation (${validationErrors.length} violations, first: ${validationErrors[0]}) — greedy kept`,
        );
        return null;
      }

      const holes = this.recomputeHolesForAssignments(candidate, ctx.slots);
      this.logger.log(
        `KON-129 solver plan SERVED: ${result.status}, filled ${candidate.length} (greedy ${greedyFilled}), equity ${candidateEquity.toFixed(4)} (greedy ${greedyEquity.toFixed(4)})`,
      );
      return { assignments: candidate, holes };
    }
  ```

  The five private helpers referenced above (`effectiveWeeklyCapMinutes`, `effectiveMonthlyCapMinutes`, `weeklySnapshotToSolverKeys`, `dailyMinutesFromSnapshot`, `workedDatesFromSnapshot`, `rotationCountsFromSnapshot`, `greedySolutionAsHint`, `validateSolverCandidate`, `recomputeHolesForAssignments`) are thin extractions over logic that ALREADY exists in the service: the weekly/monthly cap math lives in the CONTRACT_COMPLIANCE branch of `evaluateEligibility`, hole recomputation is `recomputeHoles`, and re-validation composes `checkStatutoryViolations`-style calls with the rule-engine evaluators. **Extract, do not duplicate**: each helper's body must call or lift the existing code path; if a helper would need to re-implement a rule, stop and re-read the corresponding evaluator. Keep each helper under ~25 lines; `validateSolverCandidate` returns `string[]` of violation descriptions. Add the class constant:

  ```ts
    // Story 12-1 — CP-SAT deterministic-time budget (unitless; ~<=1.2s wall on the
    // stress fixture, measured in Task 11). Never a wall-clock limit (invariant #3).
    private static readonly SOLVER_DETERMINISTIC_BUDGET = 2.0;
  ```

  Run: `pnpm --filter @pawly/api test planning-generation.service`
  Expected: all suites green including the new KON-129 describe (`Tests: 197 passed` ± the exact count at merge time).

  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-129): cp-sat improve pass — hinted, strictly-better gated, re-validated"`

- [x] **Task 10 — Perf: stress fixture with the solver (AC5)** [AC: 5]

  In the existing perf describe (`local-repair pass performance (Story 11-9, NFR2/NFR9)`) of `planning-generation.service.spec.ts`, add:

  ```ts
      it('KON-129 — cpsat engine stays inside the NFR2 budget on the 50-employee stress', async () => {
        buildStress(); // the existing 50-emp/24-7/31-day builder used by the 2s test
        const start = Date.now();
        const result = await service.generateMonthlyPlan(clinicId, '2026-03', stressTemplateId, {
          engine: 'cpsat',
        });
        const elapsed = Date.now() - start;
        expect(result.stats.engine).toBeDefined();
        expect(elapsed).toBeLessThan(PERF_BUDGET_MS); // same CI-aware constant as the 11-9 tests
      });
  ```

  Mirror the exact builder/constant names used by the neighbouring tests (`buildScarceStress` / the CI-aware budget from commit b48ee7e) — do not invent new ones. If the solver blows the budget, lower `SOLVER_DETERMINISTIC_BUDGET` until it fits and record the final value in the Dev Agent Record.

  Run: `pnpm --filter @pawly/api test planning-generation.service`
  Expected: green within the CI-aware budget.

  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-129): cpsat engine under the NFR2 stress budget"`

- [x] **Task 11 — Reference doc** [AC: 6]

  In `docs/reference/planning-algorithm-reference.md`:

  1. § "Known Algorithm Limitations", bullet 1: replace the final sentence `CP-SAT remains a Phase-3 item` (and the closing clause about the depth-2 gap) with:

  ```markdown
  Since KON-129, an **opt-in CP-SAT improve pass** (`engine: 'cpsat'`) runs after greedy+repair: the greedy solution seeds the solver as a hint, and the solver's plan is served only when strictly better (fill, then weighted equity) and fully re-validated — `stats.engine` records which engine produced the served plan. The default path remains greedy+repair; the solver's model relaxes the 35h-weekly-rest rule (re-validation enforces it exactly) and does not reproduce the ROTATION_EQUITY relaxation fallback.
  ```

  2. § "Key Files" table: add rows for `solver-model.ts` (pure CP-SAT IR builder) and `solver-engine.service.ts` (or-tools-wasm adapter — the only file importing the package).

  Run: `rg "KON-129" docs/reference/planning-algorithm-reference.md` — expected ≥ 2 matches.

  Commit: `git add docs/reference/planning-algorithm-reference.md && git commit -m "docs(KON-129): reference — cp-sat improve pass"`

- [x] **Task 12 — Full suite + build** [AC: 2, 5]

  ```bash
  bash .aped/aped-dev/scripts/run-tests.sh
  pnpm --filter @pawly/api build
  ```

  Expected: runner exit 0 (`cat .aped/.last-test-exit` → `0`), build clean (`nest build && tsc -p tsconfig.types.json` both pass — lesson L5: the tsc declaration pass is load-bearing, or-tools-wasm types must not break it).

  Commit: nothing new expected; if formatters touched files, `git add -u && git commit -m "chore(KON-129): post-suite formatting"`.

- [x] **Task 13 — Live journey (AC7 / lesson L2)** [AC: 7]

  With `pnpm dev` running and the seeded dev clinic:

  1. Call `planning.generatePlan` twice via tRPC (same month, same template): once default, once `engine: 'cpsat'` — use the admin JWT exactly as the aped_review_l2_journey memory documents (web:3020/API:3001).
  2. Record in the Dev Agent Record → Summary: hole count per engine, `stats.engine` served, the solver status line from the API logs, and wall-clock per call.
  3. If `stats.engine` is `greedy` on the real month because greedy+repair is already optimal there, that is a VALID outcome — record it as such (the strictly-better gate working), and additionally run the Task 8 fixture month through tRPC to show a served `cpsat` plan at least once.

  Then push and open the PR:

  ```bash
  git push -u origin feature/KON-129-12-1-cp-sat-optimal-solver
  gh pr create --draft --base develop --title "feat(KON-129): opt-in CP-SAT improve pass for month generation"
  ```

  PR body: follow `.aped/aped-skills/writing-discipline.md` § PRs (Summary / Problems / Solution / Validation; no internal jargon). Mark ready only after the validation block is green.

## Dev Notes

### Architecture decision (locked at story prep, 2026-07-13)

- **Solver:** `or-tools-wasm` (npm, in-process CP-SAT) — researched 2026-07-13: TypeScript API mirroring the Python OR-Tools API, CP-SAT + hint + parameter surface, Apache-2.0, benchmarks ≈ native. **Known risk: single-maintainer community package** (Axel Wickman). Accepted because (a) the adapter (`solver-engine.service.ts`) is the only importer — swap target is a Python CP-SAT microservice with the same `SolveResult` contract; (b) every solver plan is re-validated by the existing evaluators before serving, so a solver bug cannot ship an invalid plan; (c) the version is pinned. Sources: github.com/Axelwickm/or-tools-wasm · axelwickman.com/or-tools-wasm · d-krupke.github.io/cpsat-primer (L4 — re-consult before implementing).
- **Integration pattern: improve, never degrade.** Greedy+repair runs first and is the guaranteed baseline; the solver receives it as a CP-SAT hint plus a deterministic-time budget, and its plan is served only when strictly better on the exact objectives (fill, then `equityObjective` with KON-128's `deriveEquityWeights`) AND fully re-validated. There is no fallback path to get wrong: the baseline already exists.
- **Determinism (invariant #3):** `numSearchWorkers = 1`, `randomSeed = 129`, budget expressed in `maxDeterministicTime` (deterministic units), never wall-clock. Two identical runs must produce identical plans (AC4).
- **Model relaxations (deliberate, AC6):** 35h-weekly-rest is NOT in the model (only its necessary condition — one off-day per 7-day window via the ≤6-consecutive constraint); the exact check runs at re-validation and rejects. The greedy ROTATION_EQUITY relaxation fallback is not modeled — where relaxation lets greedy fill more, the strictly-better gate keeps greedy. Both are logged, never silent.
- **Objective linearization:** solver-internal equity = weighted max−min spread per metric (saturday, weekend), weights ×100 integerized; fill weight = totalSpreadWeight × (maxSpread + 1) for strict lexicographic dominance. The EXACT quadratic normalized objective is only used by the acceptance gate — solver and gate may disagree only in the conservative direction (gate keeps greedy).

### Existing code at write time (Step 0 — verbatim)

`apps/api/src/modules/planning/planning-generation.service.ts:170-178` (current, on `develop` @ b48ee7e):

```ts
  async generateMonthlyPlan(
    clinicId: string,
    month: string,
    templateId: string,
    options: {
      acknowledgePublishedChange?: boolean;
      enableRepair?: boolean;
    } = {},
  ): Promise<GenerationResult> {
```

This story adds `engine?: 'greedy' | 'cpsat'` to that options object.

`packages/validators/src/planning/planning-generation.schema.ts` (current):

```ts
export const generatePlanSchema = z.object({
  month: monthSchema,
  templateId: z.string().uuid('Template ID must be a valid UUID'),
  // Story 11-1 — bulk regeneration now honours the 7-6 published-change guard.
  acknowledgePublishedChange: z.boolean().default(false),
});
```

```ts
export const generationResultSchema = z.object({
  assignments: z.array(shiftAssignmentSchema),
  holes: z.array(holeInfoSchema),
  violations: z.object({
    hard: z.array(hardViolationSchema),
    soft: z.array(softViolationSchema),
  }),
  stats: generationStatsSchema,
});
export type GenerationResult = z.infer<typeof generationResultSchema>;
```

This story adds `engine` to `generatePlanSchema` and to `generationStatsSchema`.

`apps/api/src/trpc/routers/planning.router.ts` — `generatePlan` service call (current):

```ts
        return await ctx.planningGenerationService.generateMonthlyPlan(
          ctx.user.clinicId,
          input.month,
          input.templateId,
          { acknowledgePublishedChange: input.acknowledgePublishedChange },
        );
```

This story adds the sibling `engine: input.engine` key (Task 7).

`apps/api/src/modules/planning/planning.module.ts` — `providers` (current): `PlanningService, PlanningTemplateService, PlanningGenerationService, EquityCounterService, EquityCounterScheduler, ApprenticeDeclarationService, VarianceService, EmployeeScheduleService, PresenceConfirmationService, PresenceConfirmationScheduler`. This story appends `SolverEngineService` (Task 6).

New files (`solver-model.ts`, `solver-model.spec.ts`, `solver-engine.service.ts`, `solver-engine.service.spec.ts`, `apps/api/scripts/solver-smoke.ts`): none — greenfield files, full code in Tasks 2-6.

**⚠ KON-128 divergence:** on `develop` at branch-cut time, `local-repair.ts` still has the depth-2 `EjectionChain` shape and NO `deriveEquityWeights` / `EquityWeights` / `DEFAULT_EQUITY_WEIGHTS` — those land with PR #108 (Task 1 merge gate). After the merge, `equityObjective(loads, weights)` takes the weights parameter and `findEjectionChain` returns a `moves[]` chain. The spec fixture `buildDepth3CounterExample` referenced in Task 8 also arrives with PR #108.

### File map (3-bullet decision template per file)

- **`apps/api/src/modules/planning/solver-model.ts`** — NEW
  - Responsibility: pure, package-agnostic CP-SAT IR builder + solution decoder.
  - Inputs: `SolverInput` (employees, per-position slots, fixed baselines, rotation rules, `EquityWeights` from `./local-repair`). Outputs: `SolverModel` IR + `decodeSolution`.
- **`apps/api/src/modules/planning/solver-engine.service.ts`** — NEW
  - Responsibility: the ONLY or-tools-wasm consumer; IR → CpModel, pinned determinism params, hint, `SolveResult`.
  - Inputs: `SolverModel`, `SolveOptions`. Outputs: `{ status, chosenVarNames }`. Injectable, mockable.
- **`apps/api/src/modules/planning/planning-generation.service.ts`** — MODIFY
  - Responsibility (delta): baseline snapshot before the greedy loop; `runSolverImprovePass` after local repair; `stats.engine`; structured solver logs.
  - Inputs: `SolverEngineService` (new ctor param). Outputs: unchanged `GenerationResult` shape + `stats.engine`.
- **`packages/validators/src/planning/planning-generation.schema.ts`** — MODIFY
  - Responsibility (delta): `engine` enum on input schema + stats schema, defaults preserving today's behavior.
  - Consumers: tRPC router input validation + web types (no web change in this story).
- **`apps/api/src/trpc/routers/planning.router.ts`** — MODIFY
  - Responsibility (delta): thread `input.engine` into the service options (mirror of the 11-1 `acknowledgePublishedChange` threading).
- **Specs** — `solver-model.spec.ts` NEW, `solver-engine.service.spec.ts` NEW, `planning-generation.service.spec.ts` MODIFY, `planning-generation.schema.test.ts` MODIFY, `planning.router.spec.ts` MODIFY (arity).
- **`docs/reference/planning-algorithm-reference.md`** — MODIFY (limitations §1, Key Files).
- **`apps/api/package.json`** — MODIFY (or-tools-wasm, pinned exact version).
- **`apps/api/scripts/solver-smoke.ts`** — NEW (Task 2 witness; kept in-repo as the API-surface canary).

### Testing

- Framework: Jest (`*.spec.ts`) in `apps/api`; Vitest (`*.test.ts`) in `packages/validators`. All commands from repo root with `--filter` (root `pnpm test` is broken by the rtk shim).
- The pure IR builder is tested WITHOUT the wasm package (fast, deterministic); only `solver-engine.service.spec.ts` and the integration specs load or-tools-wasm.
- Determinism is asserted at three levels: IR build (Task 3), adapter solve (Task 5), full generation (Task 8/AC4).

### Dependencies

- **PR #108 (KON-128) must merge first** — Task 1 gate. Story consumes `deriveEquityWeights`, `EquityWeights`, `equityObjective(loads, weights)`, `computeLoads`, and the `buildDepth3CounterExample` spec fixture.
- **or-tools-wasm** (new, pinned) — apps/api only. Lesson L5: verify `tsc -p tsconfig.types.json` still passes (the package ships its own types; no `.d.ts` emission from our side changes).
- No Prisma change, no web change, no Trigger change (per 11-10: Trigger offload of Nest-DI code is dead — the improve pass is in-process and budgeted instead).

### Commit prefix

`feat(KON-129): ...` / `test(KON-129): ...` / `docs(KON-129): ...` — PR to `develop`, draft first.

## File List

- `apps/api/scripts/solver-smoke.ts` — NEW (Task 2, API-surface canary)
- `apps/api/src/modules/planning/solver-model.ts` — NEW (pure IR builder)
- `apps/api/src/modules/planning/solver-model.spec.ts` — NEW
- `apps/api/src/modules/planning/solver-engine.service.ts` — NEW (only or-tools-wasm importer)
- `apps/api/src/modules/planning/solver-engine.service.spec.ts` — NEW
- `apps/api/src/modules/planning/planning-generation.service.ts` — MODIFY (improve pass)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — MODIFY
- `apps/api/src/modules/planning/planning.module.ts` — MODIFY (provider)
- `packages/validators/src/planning/planning-generation.schema.ts` — MODIFY (engine flag + stats)
- `packages/validators/src/planning/planning-generation.schema.test.ts` — MODIFY
- `apps/api/src/trpc/routers/planning.router.ts` — MODIFY (thread engine)
- `apps/api/src/trpc/routers/planning.router.spec.ts` — MODIFY (arity)
- `apps/api/package.json` / `pnpm-lock.yaml` — MODIFY (or-tools-wasm pinned)
- `docs/reference/planning-algorithm-reference.md` — MODIFY (limitations §1, Key Files)

## Dev Agent Record

- **Model:** claude-fable-5
- **Started:** 2026-07-13T16:00:00Z
- **Completed:** 2026-07-13T18:45:00Z

### Summary

All 7 ACs green. The opt-in `engine: 'cpsat'` improve pass runs after greedy+repair, seeds the solver with the greedy plan as a CP-SAT hint, and serves the solver plan only when strictly better (fill, then the KON-128 weighted equity objective) AND fully re-validated. Live journey (AC7, clinic "Clinique test", month 2026-07, template "semaine standard", via tRPC with admin JWT + `x-trpc-source`): `greedy` 879ms → 85/85 filled, 0 holes; `cpsat` 991ms → solver log `KON-129 solver OPTIMAL: filled 85/85, equity 1.3773 vs 1.3773 — greedy plan kept`, served `greedy` — the VALID already-optimal outcome the story anticipated (the strictly-better gate held; the served-cpsat path is proven end-to-end by the AC1 integration test through the real solver). Deterministic budget calibrated at 0.05 (det→wall ≈ 6× on this hardware; ~0.35s at 50-employee scale, ample for OPTIMAL at real clinic scale).

### Files changed

- `apps/api/src/modules/planning/solver-model.ts` (+spec) NEW — pure package-agnostic IR builder
- `apps/api/src/modules/planning/solver-engine.service.ts` (+spec) NEW — only or-tools-wasm importer
- `apps/api/src/modules/planning/planning-generation.service.ts` (+spec) — improve pass, baseline snapshot, `stats.engine`, replay re-validation
- `apps/api/src/modules/planning/planning.module.ts` — provider
- `packages/validators/src/planning/planning-generation.schema.ts` (+test) — `engine` on input + stats schemas
- `apps/api/src/trpc/routers/planning.router.ts` (+spec) — threads `input.engine`
- `apps/api/scripts/solver-smoke.ts` NEW — API-surface canary
- `apps/api/package.json` / `pnpm-lock.yaml` — or-tools-wasm pinned 0.9.1
- `docs/reference/planning-algorithm-reference.md` — limitations §1-2 + Key Files

### Deviations

- **or-tools-wasm real API** (Task 2 canary, corrected from the story's best-known mapping): import from the `or-tools-wasm/cp-sat` subpath; constraints via `addLinearConstraint(LinearExpr.weightedSum(vars, coeffs), lb, ub)`; statuses normalized via `solver.statusName()`; day-worked links via `addImplication`. **ESM-only package under a CJS Nest/Jest world**: loaded through `process.getBuiltinModule('node:module').createRequire` — Jest shims both dynamic `import()` (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG) and the imported `createRequire` ("Cannot use import statement outside a module"); the process-level API is the one require Jest cannot intercept, with the imported `createRequire` as runtime fallback.
- **Re-validation = replay, not bespoke helpers** (extract-don't-duplicate): GENERATED assignments are lifted off the live counters, then each candidate re-checked through `evaluateEligibility` + `applyAssignment` — exact by construction (incl. the 35h weekly rest the model relaxes); eligibility is monotone so any replay order is sound.
- **Model drops per-position expansion**: `x[e, slot]` with a `requiredStaff` fill cap is exactly equivalent (identical positions overlap) — halves the vars, removes position symmetry. Found while chasing the NFR2 stress budget.
- **`SOLVER_DETERMINISTIC_BUDGET` 2.0 → 0.05** after a scratch diagnosis (IR build 43ms; det 0.5 ≈ 3.2s wall, det 0.1 ≈ 0.63s, no-hint solves return UNKNOWN at stress scale — the hint is what makes small budgets useful). Trade-off documented: at 50-employee scale the solver rarely improves within budget; at real clinic scale it proves OPTIMAL (live journey did).
- **Perf pins gained a TURBO_HASH tier** (6s under the parallel runner, 2s standalone, 8s CI): the PRE-existing 11-9 scarce test showed the same ~5× contention under `turbo run test` (api Jest + web Vitest on the same cores) — not a KON-129 regression (full API suite standalone: 1034/1034).
- **AC6 exercised via a monthly-cap violation** instead of weekly-rest: same re-validation rejection path, but the mocked solver plan must use model-existing var names AND beat the greedy-alone baseline (3 fills > 2) to reach re-validation — a weekly-rest fixture couldn't pass the strictness gate on this small month.

### Test output

```
# bash .aped/aped-dev/scripts/run-tests.sh  (turbo run test, full monorepo)
Tasks: 8 successful, 8 total — .aped/.last-test-exit = 0
API (standalone): Test Suites: 38 passed — Tests: 1034 passed
  planning-generation.service.spec: 198 passed (KON-129: AC1/AC2/AC3×2/AC4/AC6 + NFR2 stress 1167ms < 2000ms)
  solver-model.spec: 11 passed · solver-engine.service.spec: 5 passed (real solves)
Validators: 779 passed (engine schema defaults/enum)
# pnpm --filter @pawly/api build → nest build (SWC 152 files) + tsc -p tsconfig.types.json: clean (L5)
# Smoke: pnpm --filter @pawly/api exec tsx scripts/solver-smoke.ts → SMOKE OK — OPTIMAL, objective 5, hint accepted
```
