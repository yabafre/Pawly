# Story: 11-9-local-repair-pass-grasp — Local Repair Pass (GRASP) for Generation Completeness

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** ready-for-dev
**Branch:** feature/KON-126-11-9-local-repair-pass-grasp
**Ticket:** KON-126 (Linear · project Pawly · milestone Epic 11 · blocked by KON-119 / 11-2 + KON-125 / 11-8 · last of the epic)
**Origin:** Multi-agent planning audit 2026-07-08 — documented finding: *"Greedy is incomplete. Single pass, no backtracking (`:293`); hole on `No eligible employees`; bin-packing counter-example verified. Fix with a local repair pass (GRASP), **not** CP-SAT at this scale."* See `docs/epics-context/epic-11-context.md` § 0 and § 4, and `docs/reference/planning-algorithm-reference.md:321-331` ("Known Algorithm Limitations").

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, cross-cutting invariants, and the per-story outcomes of 11-2 / 11-7 / 11-8 / 11-10 that this story builds on. Line numbers below were re-verified against this worktree during authoring (the service is ~3882 lines post-11-2..11-10 merge); **re-locate the symbol, do not trust the number blindly.**

## User Story

**As an** admin user, **I want** the generator to attempt to fill the holes a single greedy pass leaves behind, **so that** the schedule is as complete as feasible without introducing rule violations.

## Acceptance Criteria

1. **AC1 — Counter-example proven, hole repaired by ejection chain.** **Given** a crafted generation input where the single greedy pass leaves ≥1 hole while a feasible fuller assignment exists (a bin-packing counter-example expressed as a deterministic fixture), **When** `generateMonthlyPlan` runs with the local-repair pass, **Then** the pass fills the hole via an ejection chain of depth ≤ 2 (move an already-assigned employee onto the hole slot and backfill the vacated slot with an idle employee), and the result has **strictly fewer holes** than the greedy-only baseline (same fixture run with the pass disabled) — proving it is the pass, not the fixture, that closes the gap.
2. **AC2 — Equity hill-climbing against an explicit global objective.** **Given** a hole-free result that is inequitable (an employee carries a disproportionate weekend/Saturday load while a swap would rebalance it), **When** the repair pass runs, **Then** it applies weekend/Saturday-rebalancing swaps only when they **strictly decrease** an explicit scalar objective (documented: sum of squared deviations of per-employee `saturdayCount` / `weekendCount` / `shiftCount` from their workforce means); the objective is monotonically non-increasing across the pass (termination guaranteed); and no swap is applied that would raise it.
3. **AC3 — Every move is validity-safe and counter-consistent.** **Given** any candidate move (ejection or swap), **When** it is evaluated, **Then** eligibility is re-checked through the **same shared evaluator that generation uses** — covering unavailability, time overlap, required job type, hard rotation-equity caps, hard weekly/monthly contract-hour limits, minimum rest between shifts, and the French statutory limits — so **no applied move introduces a hard-rule violation**; and applying or reverting a move keeps every equity and workload counter consistent (weekly and monthly minutes, shift and shift-type counts, and weekend/Saturday/day-of-week tallies).
4. **AC4 — Bounded, deterministic, recomputed, observable.** **Given** the pass runs on any month, **When** it completes, **Then** it is bounded (ejection depth ≤ 2; a fixed hill-climb iteration budget; the pass periodically yields the event loop so generation still meets NFR2 < 2s at 50 employees), fully deterministic (no randomness — a stable candidate ordering), and holes / violations / stats are recomputed from the final assignments so each remaining hole still carries a visible reason.

**FRs covered:** FR5 (generate draft schedules highlighting holes — now as complete as feasible). **NFRs:** NFR2 (< 2s), NFR3 (each remaining hole carries a reason; no silent failure).

> **Mechanism map (AC → surface, realized in Tasks):**
> - AC1 (ejection chains) → pure `findEjectionChain` (Task 2) + `runLocalRepairPass` hole-repair phase (Task 5), proven by the counter-example fixture (Tasks 1 + 4).
> - AC2 (equity hill-climb) → pure `equityObjective` + `selectImprovingSwap` (Task 2) + the hill-climb loop in `runLocalRepairPass` (Task 5), proven by Tasks 1 + 4.
> - AC3 (safety + counter lockstep) → extracted `evaluateEligibility` shared with `scoreAndAssign` (Task 3) consumed as the injected `isEligible` predicate; `applyAssignment` / `removeAssignment` mutate every counter (Task 5).
> - AC4 (bounds/determinism/recompute) → constants + `setImmediate` yield + `recomputeHoles` (Task 5); NFR2 stress (Task 6).

> **Scope decisions locked with Alex during authoring (GATE step-04):**
> - **Pure module `local-repair.ts`, NOT a new `@pawly/*` package** — co-located with the existing pure `rule-engine.ts` (11-8) and `french-labor-law.ts` (11-3). Framework-free, side-effect-free, unit-tested in isolation. Same rationale as 11-8: a workspace package would add turbo `^build` ordering + a jest `moduleNameMapper` + the L5 `.d.ts` gate, for a surface `apps/web` does not consume. Promotion to `@pawly/*` later is a mechanical move.
> - **Both mechanisms in this story** — hole-repair (ejection chains) AND equity hill-climbing swaps, as KON-126 defines. One pass, one insertion point, one shared counter set.
> - **Conservative eligibility, evaluated on pre-move live state.** A move's validity is checked with the counters as they stand *before* the move is applied. Removing an assignment only *relaxes* per-employee constraints (frees overlap, lowers weekly/monthly minutes, lowers consecutive-day/statutory load), so a candidate that passes `evaluateEligibility` while the mover is still counted on its old slot is **guaranteed** to pass after the move too. This trades a few missed same-date-overlap chains (false negatives) for a hard guarantee of zero invalid moves (no false positives). Belt-and-suspenders: `runLocalRepairPass` re-checks after applying and **reverts** if the post-apply state is somehow invalid.
> - **Strict rotation for repair (no greedy fallback).** `scoreAndAssign`'s ROTATION_EQUITY relaxation fallback (`:1172-1193`) exists to avoid holes when *every* employee hit the rotation cap; it emits a soft warning. The repair pass must not introduce hard violations, so it treats a HARD ROTATION_EQUITY breach as ineligible (no relaxation). The extracted predicate surfaces `blockedOnlyByRotation` so `scoreAndAssign` keeps its fallback while the repair pass consumes only `.eligible`.
> - **Determinism preserved (invariant #3).** No `Math.random`. All candidate iteration is over deterministically-sorted keys. This keeps generation reproducible for tests, bug repro, and any future benchmark.
> - **Out of scope (follow-ups, not this story):** CP-SAT / global optimisation (Phase 3 per PRD); deeper ejection chains (depth > 2); making the objective weights clinic-configurable; repairing across *survivor* (MANUAL/confirmed) shifts — survivors are immovable, the repair only re-arranges GENERATED assignments.

## Tasks

- [x] **Task 1: RED — unit-test the pure repair module in isolation** [AC: 1, 2]
  Create `apps/api/src/modules/planning/local-repair.spec.ts` with the full contents below. It fails to compile/run until Task 2 creates the module (that is the RED state). Covers the equity objective, the depth-≤2 ejection search (including the bin-packing counter-example), and the strictly-improving swap selection.
  ```ts
  import {
    equityObjective,
    computeLoads,
    findEjectionChain,
    selectImprovingSwap,
    type RepairSlot,
    type RepairAssignment,
  } from './local-repair';

  const slot = (
    id: string,
    date: string,
    shiftTypeCode: string,
    startTime = '09:00',
    endTime = '17:00',
    breakMinutes = 0,
    requiredJobTypes?: string[],
  ): RepairSlot => ({ id, date, shiftTypeCode, startTime, endTime, breakMinutes, requiredJobTypes });

  const assign = (slotId: string, employeeId: string): RepairAssignment => ({ slotId, employeeId });

  describe('equityObjective + computeLoads', () => {
    it('computeLoads counts saturday, weekend and shift totals per employee', () => {
      const slotById = new Map<string, RepairSlot>([
        ['s-sat', slot('s-sat', '2026-08-01', 'CHIR')], // 2026-08-01 is a Saturday
        ['s-sun', slot('s-sun', '2026-08-02', 'CHIR')], // Sunday
        ['s-mon', slot('s-mon', '2026-08-03', 'CHIR')], // Monday
      ]);
      const loads = computeLoads(
        [assign('s-sat', 'e1'), assign('s-sun', 'e1'), assign('s-mon', 'e2')],
        slotById,
      );
      expect(loads.get('e1')).toEqual({ saturdayCount: 1, weekendCount: 2, shiftCount: 2 });
      expect(loads.get('e2')).toEqual({ saturdayCount: 0, weekendCount: 0, shiftCount: 1 });
    });

    it('objective is 0 for a perfectly balanced load and positive otherwise', () => {
      const balanced = new Map([
        ['e1', { saturdayCount: 1, weekendCount: 1, shiftCount: 2 }],
        ['e2', { saturdayCount: 1, weekendCount: 1, shiftCount: 2 }],
      ]);
      expect(equityObjective(balanced)).toBe(0);
      const skewed = new Map([
        ['e1', { saturdayCount: 2, weekendCount: 2, shiftCount: 2 }],
        ['e2', { saturdayCount: 0, weekendCount: 0, shiftCount: 2 }],
      ]);
      expect(equityObjective(skewed)).toBeGreaterThan(0);
    });
  });

  describe('findEjectionChain — bin-packing counter-example (AC1)', () => {
    // Two VET-only slots on different days. Greedy placed VET "a" on s1 (which
    // "b" could also cover) and then cannot fill s2 (VET-only) because "a" is the
    // only VET left with budget → hole on s2. A depth-2 ejection fixes it:
    // move "a" from s1 → s2 (the hole), backfill s1 with "b".
    const s1 = slot('s1', '2026-08-03', 'CHIR', '09:00', '17:00', 0, ['VET']); // Monday
    const s2 = slot('s2', '2026-08-05', 'CHIR', '09:00', '17:00', 0, ['VET']); // Wednesday (the hole)
    const slotById = new Map<string, RepairSlot>([['s1', s1], ['s2', s2]]);
    const assignments = [assign('s1', 'a')];
    const employees = ['a', 'b'];

    it('finds the depth-2 chain that a single greedy pass cannot', () => {
      // Eligibility: "a" is VET (fits both slots); "b" is VET but only has budget
      // for one more shift, so "b" fits s1. "a" fits the hole s2.
      const isEligible = (emp: string, s: RepairSlot): boolean => {
        if (s.id === 's2') return emp === 'a'; // only "a" can take the hole
        if (s.id === 's1') return emp === 'a' || emp === 'b'; // both can take s1
        return false;
      };
      const chain = findEjectionChain(s2, assignments, slotById, employees, isEligible);
      expect(chain).toEqual({
        holeSlotId: 's2',
        ejectFromSlotId: 's1',
        moverEmployeeId: 'a',
        backfillEmployeeId: 'b',
      });
    });

    it('returns null when no backfill exists for the vacated slot', () => {
      const isEligible = (emp: string, s: RepairSlot): boolean =>
        s.id === 's2' ? emp === 'a' : emp === 'a'; // nobody but "a" fits s1 either
      expect(findEjectionChain(s2, assignments, slotById, employees, isEligible)).toBeNull();
    });

    it('is deterministic — same inputs, same chain, no RNG', () => {
      const isEligible = (emp: string, s: RepairSlot): boolean =>
        s.id === 's2' ? emp === 'a' : true;
      const first = findEjectionChain(s2, assignments, slotById, employees, isEligible);
      const second = findEjectionChain(s2, assignments, slotById, employees, isEligible);
      expect(first).toEqual(second);
    });
  });

  describe('selectImprovingSwap — equity hill-climb (AC2)', () => {
    // e1 works both weekend days, e2 works both weekdays. Swapping one weekend
    // day between them strictly lowers the weekend/Saturday variance.
    const slotById = new Map<string, RepairSlot>([
      ['s-sat', slot('s-sat', '2026-08-01', 'CHIR')], // Saturday, e1
      ['s-sun', slot('s-sun', '2026-08-02', 'CHIR')], // Sunday, e1
      ['s-mon', slot('s-mon', '2026-08-03', 'CHIR')], // Monday, e2
      ['s-tue', slot('s-tue', '2026-08-04', 'CHIR')], // Tuesday, e2
    ]);
    const assignments = [
      assign('s-sat', 'e1'),
      assign('s-sun', 'e1'),
      assign('s-mon', 'e2'),
      assign('s-tue', 'e2'),
    ];

    it('proposes a swap that strictly decreases the objective', () => {
      const isEligible = () => true; // everyone fits everywhere
      const swap = selectImprovingSwap(assignments, slotById, isEligible);
      expect(swap).not.toBeNull();
      // Applying the proposed swap must lower the objective vs the current one.
      const before = equityObjective(computeLoads(assignments, slotById));
      const swapped = assignments.map((a) => {
        if (a.slotId === swap!.slotIdA) return assign(a.slotId, swap!.employeeB);
        if (a.slotId === swap!.slotIdB) return assign(a.slotId, swap!.employeeA);
        return a;
      });
      const after = equityObjective(computeLoads(swapped, slotById));
      expect(after).toBeLessThan(before);
    });

    it('returns null when no eligible swap improves the objective', () => {
      const isEligible = () => true;
      const balanced = [
        assign('s-sat', 'e1'),
        assign('s-sun', 'e2'),
        assign('s-mon', 'e1'),
        assign('s-tue', 'e2'),
      ];
      expect(selectImprovingSwap(balanced, slotById, isEligible)).toBeNull();
    });

    it('never proposes a swap that fails the eligibility predicate', () => {
      const isEligible = (emp: string, s: RepairSlot) => !(emp === 'e2' && s.id === 's-sat');
      const swap = selectImprovingSwap(assignments, slotById, isEligible);
      // e2 cannot go on Saturday, so the only balancing swap is rejected.
      expect(swap).toBeNull();
    });
  });
  ```
  Run: `pnpm --filter @pawly/api test -- local-repair`
  Expected: the suite **fails** because `./local-repair` does not exist yet — output contains `Cannot find module './local-repair'` (this is the intended RED state; do not proceed to commit until Task 2 turns it green).
  Commit: `git add apps/api/src/modules/planning/local-repair.spec.ts && git commit -m "test(KON-126): RED — unit specs for the pure local-repair module"`

- [x] **Task 2: GREEN — create the pure repair module `local-repair.ts`** [AC: 1, 2, 4]
  Create `apps/api/src/modules/planning/local-repair.ts` with the full contents below. Pure module — no NestJS, no Prisma, no I/O — mirroring `rule-engine.ts` and `french-labor-law.ts`. It decides *which* moves to try (deterministically) and evaluates the equity objective; the service owns the counters, applies the moves, and injects the `isEligible` predicate.
  ```ts
  /**
   * Pure local-repair search — Story 11-9 (KON-126).
   *
   * A single greedy pass (PlanningGenerationService.generateMonthlyPlan) never revisits a
   * decision, so it can leave a hole that a fuller feasible assignment would avoid (bin-packing
   * counter-example, documented in planning-algorithm-reference.md §321-331). This module is the
   * pure decision core of a bounded GRASP-style local-repair pass that runs after the greedy loop:
   *
   *   1. hole-repair via ejection chains of depth <= 2 (move an assigned employee onto a hole and
   *      backfill the vacated slot with an idle one) — the move a greedy pass cannot make;
   *   2. equity hill-climbing swaps against an explicit global objective.
   *
   * Pure: no NestJS, no Prisma, no I/O (same discipline as rule-engine.ts / french-labor-law.ts).
   * The service injects `isEligible` (the SAME predicate scoreAndAssign uses — see
   * PlanningGenerationService.evaluateEligibility) and applies/reverts the moves against its live
   * counters. Eligibility is evaluated on PRE-MOVE state: removing an assignment only relaxes
   * per-employee constraints, so a move that passes here is guaranteed valid after it is applied.
   *
   * Determinism (invariant #3): every iteration is over deterministically-sorted keys, no RNG.
   * Dates are 'YYYY-MM-DD' interpreted in UTC (matches getWeekBounds / isoDayOf in the service).
   */

  /** One demand position the repair can host an employee on. `id` is a stable deterministic key. */
  export interface RepairSlot {
    id: string;
    date: string; // 'YYYY-MM-DD'
    shiftTypeCode: string;
    startTime: string; // 'HH:MM'
    endTime: string;
    breakMinutes: number;
    requiredJobTypes?: string[];
  }

  /** One employee currently assigned to a demand slot. */
  export interface RepairAssignment {
    slotId: string;
    employeeId: string;
  }

  /** Per-employee equity load the objective reads. */
  export interface EmployeeLoad {
    saturdayCount: number;
    weekendCount: number;
    shiftCount: number;
  }

  /** A depth-2 ejection chain: mover leaves `ejectFromSlotId` for the hole; backfill takes the vacated slot. */
  export interface EjectionChain {
    holeSlotId: string;
    ejectFromSlotId: string;
    moverEmployeeId: string;
    backfillEmployeeId: string;
  }

  /** An equity-improving swap: employeeA and employeeB exchange their two slots. */
  export interface EquitySwap {
    slotIdA: string;
    slotIdB: string;
    employeeA: string;
    employeeB: string;
  }

  /** Injected validity predicate — the service's evaluateEligibility(...).eligible closed over live state. */
  export type IsEligible = (employeeId: string, slot: RepairSlot) => boolean;

  /** Objective comparisons use this epsilon so float noise never registers as an improvement. */
  const OBJECTIVE_EPSILON = 1e-9;

  /** ISO weekday 1..7 (Mon..Sun) for a 'YYYY-MM-DD' date, UTC — matches the service's isoDayOf. */
  function isoWeekday(dateISO: string): number {
    const dow = new Date(`${dateISO}T00:00:00.000Z`).getUTCDay();
    return dow === 0 ? 7 : dow;
  }

  /** Per-employee load contribution of a single slot: +1 shift, +weekend/+saturday by its weekday. */
  function slotContribution(slot: RepairSlot): EmployeeLoad {
    const iso = isoWeekday(slot.date);
    return {
      saturdayCount: iso === 6 ? 1 : 0,
      weekendCount: iso === 6 || iso === 7 ? 1 : 0,
      shiftCount: 1,
    };
  }

  /** Aggregate the per-employee load from the current assignments. */
  export function computeLoads(
    assignments: RepairAssignment[],
    slotById: Map<string, RepairSlot>,
  ): Map<string, EmployeeLoad> {
    const loads = new Map<string, EmployeeLoad>();
    for (const a of assignments) {
      const slot = slotById.get(a.slotId);
      if (!slot) continue;
      const c = slotContribution(slot);
      const cur = loads.get(a.employeeId) ?? { saturdayCount: 0, weekendCount: 0, shiftCount: 0 };
      cur.saturdayCount += c.saturdayCount;
      cur.weekendCount += c.weekendCount;
      cur.shiftCount += c.shiftCount;
      loads.set(a.employeeId, cur);
    }
    return loads;
  }

  /**
   * Explicit global equity objective (LOWER is fairer): the sum of squared deviations of each
   * employee's saturdayCount / weekendCount / shiftCount from their respective workforce means.
   * Pure function of the load map — deterministic. 0 iff every metric is identical across employees.
   */
  export function equityObjective(loads: Map<string, EmployeeLoad>): number {
    const n = loads.size;
    if (n === 0) return 0;
    let sumSat = 0;
    let sumWeekend = 0;
    let sumShift = 0;
    for (const l of loads.values()) {
      sumSat += l.saturdayCount;
      sumWeekend += l.weekendCount;
      sumShift += l.shiftCount;
    }
    const meanSat = sumSat / n;
    const meanWeekend = sumWeekend / n;
    const meanShift = sumShift / n;
    let obj = 0;
    for (const l of loads.values()) {
      obj += (l.saturdayCount - meanSat) ** 2;
      obj += (l.weekendCount - meanWeekend) ** 2;
      obj += (l.shiftCount - meanShift) ** 2;
    }
    return obj;
  }

  /**
   * Depth-<=2 ejection chain for a single hole. Scans the current assignments in deterministic
   * order; for each candidate mover eligible for the hole, scans employees in deterministic order
   * for a backfill eligible for the vacated slot (excluding the mover). Returns the first such
   * chain, or null. Eligibility is evaluated on pre-move state (conservative — see module header).
   */
  export function findEjectionChain(
    hole: RepairSlot,
    assignments: RepairAssignment[],
    slotById: Map<string, RepairSlot>,
    employees: string[],
    isEligible: IsEligible,
  ): EjectionChain | null {
    const sortedEmployees = [...employees].sort();
    // Deterministic mover order: by the vacated slot's (date, shiftTypeCode, startTime), then employeeId.
    const sortedAssignments = [...assignments].sort((x, y) => {
      const sx = slotById.get(x.slotId);
      const sy = slotById.get(y.slotId);
      const kx = sx ? `${sx.date}|${sx.shiftTypeCode}|${sx.startTime}` : x.slotId;
      const ky = sy ? `${sy.date}|${sy.shiftTypeCode}|${sy.startTime}` : y.slotId;
      return kx === ky ? x.employeeId.localeCompare(y.employeeId) : kx.localeCompare(ky);
    });

    for (const mover of sortedAssignments) {
      if (mover.slotId === hole.id) continue; // already on the hole slot
      if (!isEligible(mover.employeeId, hole)) continue; // mover must be able to take the hole
      const vacated = slotById.get(mover.slotId);
      if (!vacated) continue;
      for (const backfill of sortedEmployees) {
        if (backfill === mover.employeeId) continue;
        if (isEligible(backfill, vacated)) {
          return {
            holeSlotId: hole.id,
            ejectFromSlotId: mover.slotId,
            moverEmployeeId: mover.employeeId,
            backfillEmployeeId: backfill,
          };
        }
      }
    }
    return null;
  }

  /**
   * Best-improvement equity swap: over all ordered assignment pairs (a before b by slot key then
   * employeeId), pick the eligible swap that yields the greatest strict decrease of equityObjective.
   * Deterministic tiebreak by (slotIdA, slotIdB). Returns null when no eligible swap improves the
   * objective. Eligibility is evaluated on pre-move state (conservative — see module header).
   */
  export function selectImprovingSwap(
    assignments: RepairAssignment[],
    slotById: Map<string, RepairSlot>,
    isEligible: IsEligible,
  ): EquitySwap | null {
    const baseLoads = computeLoads(assignments, slotById);
    const base = equityObjective(baseLoads);

    const keyOf = (a: RepairAssignment): string => {
      const s = slotById.get(a.slotId);
      return s ? `${s.date}|${s.shiftTypeCode}|${s.startTime}|${a.employeeId}` : `${a.slotId}|${a.employeeId}`;
    };
    const sorted = [...assignments].sort((x, y) => keyOf(x).localeCompare(keyOf(y)));

    let best: EquitySwap | null = null;
    let bestObj = base - OBJECTIVE_EPSILON; // must strictly beat the base

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (a.employeeId === b.employeeId) continue; // swapping a slot with itself's owner is a no-op
        const slotA = slotById.get(a.slotId);
        const slotB = slotById.get(b.slotId);
        if (!slotA || !slotB) continue;
        // A swap keeps both slots filled; it only rebalances weekend/Saturday load. Skip pairs whose
        // day contributions are identical (swap cannot change the objective).
        const cA = slotContribution(slotA);
        const cB = slotContribution(slotB);
        if (cA.saturdayCount === cB.saturdayCount && cA.weekendCount === cB.weekendCount) continue;
        if (!isEligible(a.employeeId, slotB) || !isEligible(b.employeeId, slotA)) continue;

        const swapped = sorted.map((x) => {
          if (x === a) return { slotId: a.slotId, employeeId: b.employeeId };
          if (x === b) return { slotId: b.slotId, employeeId: a.employeeId };
          return x;
        });
        const obj = equityObjective(computeLoads(swapped, slotById));
        if (obj < bestObj) {
          bestObj = obj;
          best = { slotIdA: a.slotId, slotIdB: b.slotId, employeeA: a.employeeId, employeeB: b.employeeId };
        }
      }
    }
    return best;
  }
  ```
  Run: `pnpm --filter @pawly/api test -- local-repair`
  Expected: `Tests:` all passed (≥ 8 passing), exit 0.
  Also run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20` → no error lines referencing `local-repair.ts`, exit 0.
  Commit: `git add apps/api/src/modules/planning/local-repair.ts && git commit -m "feat(KON-126): pure GRASP local-repair search module (GREEN)"`

- [x] **Task 3: Extract the shared eligibility predicate `evaluateEligibility` (no divergence)** [AC: 3]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, extract the per-employee eligibility logic currently inlined in `scoreAndAssign`'s `employees.filter(...)` (lines ~1036-1170) into a private method both `scoreAndAssign` and the repair pass call. This is the L-audit lesson applied: one eligibility implementation, no fourth divergent path.

  **(a) Add the private method** immediately before `private scoreAndAssign(` (line ~990). It returns whether the employee is eligible AND whether the *only* thing blocking them was HARD ROTATION_EQUITY (so `scoreAndAssign` keeps its relaxation fallback; the repair pass ignores that flag and treats rotation-blocked as ineligible):
  ```ts
  /**
   * Story 11-9 — the single per-employee eligibility predicate, shared by scoreAndAssign's
   * greedy filter and the local-repair pass. Mirrors the non-disableable HARD checks exactly:
   * unavailability, time overlap, requiredJobTypes, HARD CONTRACT_COMPLIANCE (weekly/monthly via
   * the unified rule engine) + minRestHoursBetweenShifts, French statutory limits, and HARD
   * ROTATION_EQUITY. `blockedOnlyByRotation` is true iff every other check passed and only the
   * rotation cap failed — scoreAndAssign uses it to feed its relaxation fallback; the repair pass
   * ignores it (rotation breach = ineligible, no relaxation). Evaluated on current live state.
   */
  private evaluateEligibility(
    emp: EmployeeInfo,
    slot: SlotRequirement,
    ctx: {
      constraints: ConstraintMap;
      assignmentIndex: Map<string, AssignedShift[]>;
      weeklyMinutesCounter: Map<string, number>;
      employeeMinutes: Map<string, number>;
      dayOfWeekCounts: Map<string, Map<number, number>>;
      quarterlyDayOfWeekCounts: Map<string, Map<number, number>>;
    },
  ): { eligible: boolean; blockedOnlyByRotation: boolean } {
    const slotMinutes =
      this.calculateShiftMinutes(slot.startTime, slot.endTime) - (slot.breakMinutes || 0);
    const weekBounds = this.getWeekBounds(slot.date);

    // 1) Unavailability
    const unavailDates = ctx.constraints.unavailableMap.get(emp.id);
    if (unavailDates?.has(slot.date)) return { eligible: false, blockedOnlyByRotation: false };

    // 2) Time overlap with an existing assignment on the same date
    const existingOnDate = ctx.assignmentIndex.get(`${emp.id}|${slot.date}`) || [];
    for (const existing of existingOnDate) {
      if (this.timesOverlap(slot.startTime, slot.endTime, existing.startTime, existing.endTime)) {
        return { eligible: false, blockedOnlyByRotation: false };
      }
    }

    // 3) Required job type
    if (
      slot.requiredJobTypes &&
      slot.requiredJobTypes.length > 0 &&
      !slot.requiredJobTypes.includes(emp.jobType)
    ) {
      return { eligible: false, blockedOnlyByRotation: false };
    }

    // 4) HARD CONTRACT_COMPLIANCE (weekly + monthly via the unified engine) + minRest
    const weekMinutes = ctx.weeklyMinutesCounter.get(`${emp.id}|${weekBounds.start}`) || 0;
    const hardContractRules = ctx.constraints.hardRules.filter(
      (r) => r.category === 'CONTRACT_COMPLIANCE',
    );
    for (const rule of hardContractRules) {
      const config = rule.config;
      if (
        violatesHardContractIncremental(
          { id: rule.id, name: rule.name, ruleType: 'HARD' as RuleType, category: rule.category, config },
          {
            weekMinutes,
            monthMinutes: ctx.employeeMinutes.get(emp.id) || 0,
            candidateMinutes: slotMinutes,
            contractHours: emp.contractHours,
          },
        )
      ) {
        return { eligible: false, blockedOnlyByRotation: false };
      }

      const minRest = config.minRestHoursBetweenShifts as number | undefined;
      if (minRest) {
        const minRestMin = minRest * 60;
        const prevDate = this.getPreviousDate(slot.date);
        const prevShifts = ctx.assignmentIndex.get(`${emp.id}|${prevDate}`) || [];
        for (const prev of prevShifts) {
          const rest = 24 * 60 - this.toMinutes(prev.endTime) + this.toMinutes(slot.startTime);
          if (rest < minRestMin) return { eligible: false, blockedOnlyByRotation: false };
        }
        const nextDate = this.getNextDate(slot.date);
        const nextShifts = ctx.assignmentIndex.get(`${emp.id}|${nextDate}`) || [];
        for (const next of nextShifts) {
          const rest = 24 * 60 - this.toMinutes(slot.endTime) + this.toMinutes(next.startTime);
          if (rest < minRestMin) return { eligible: false, blockedOnlyByRotation: false };
        }
      }
    }

    // 5) French labor-law HARD limits (Story 11-3) — +/-8 day window around the slot
    {
      const statutoryWindow: StatutoryShift[] = [];
      let cursor = this.getPreviousDate(slot.date);
      for (let i = 0; i < 8; i++) {
        statutoryWindow.push(...(ctx.assignmentIndex.get(`${emp.id}|${cursor}`) || []));
        cursor = this.getPreviousDate(cursor);
      }
      cursor = slot.date;
      for (let i = 0; i < 9; i++) {
        statutoryWindow.push(...(ctx.assignmentIndex.get(`${emp.id}|${cursor}`) || []));
        cursor = this.getNextDate(cursor);
      }
      const statutoryBreach = wouldExceedStatutory(statutoryWindow, {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        breakMinutes: slot.breakMinutes,
      });
      if (statutoryBreach.length > 0) return { eligible: false, blockedOnlyByRotation: false };
    }

    // 6) HARD ROTATION_EQUITY — the ONLY check that feeds the relaxation fallback
    for (const rule of ctx.constraints.hardRules) {
      if (rule.category === 'ROTATION_EQUITY') {
        if (
          this.violatesHardRotationEquity(
            rule,
            slot,
            emp,
            ctx.dayOfWeekCounts,
            ctx.quarterlyDayOfWeekCounts,
          )
        ) {
          return { eligible: false, blockedOnlyByRotation: true };
        }
      }
    }

    return { eligible: true, blockedOnlyByRotation: false };
  }
  ```

  **(b) Replace the `employees.filter(...)` block in `scoreAndAssign`.** Anchor on the current filter (lines ~1034-1170), from `const rotationEquityBlocked: EmployeeInfo[] = [];` through the closing `});` of the `.filter(...)`. Replace the entire block with the delegating version below (same behaviour: same eligible set, same `rotationEquityBlocked` bucket):
  ```ts
    // Filter eligible employees — track rotation-equity-blocked separately for fallback.
    // Story 11-9 — eligibility is the shared evaluateEligibility predicate (also used by the
    // local-repair pass). Behaviour is unchanged: an employee blocked only by HARD ROTATION_EQUITY
    // is bucketed for the relaxation fallback below; any other HARD breach eliminates them.
    const rotationEquityBlocked: EmployeeInfo[] = [];
    const eligibilityCtx = {
      constraints,
      assignmentIndex,
      weeklyMinutesCounter,
      employeeMinutes,
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
    };
    const eligible = employees.filter((emp) => {
      const verdict = this.evaluateEligibility(emp, slot, eligibilityCtx);
      if (!verdict.eligible && verdict.blockedOnlyByRotation) {
        rotationEquityBlocked.push(emp);
      }
      return verdict.eligible;
    });
  ```
  (The `weeklyMinutesMap`/`hardContractRules` locals that used to precede the filter are now internal to `evaluateEligibility`; if `tsc` flags either as unused after this replace, delete that now-dead local. `weekBounds`/`slotMinutes` remain used by the scoring section below — keep them.)

  **(c) Characterization test — `scoreAndAssign` output is unchanged.** In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add this block at the end of the top-level `describe` (before its closing `});`). It pins that the extraction preserved eligibility, the rotation-relaxation fallback, and determinism:
  ```ts
  // ─── Story 11-9 — evaluateEligibility extraction is behaviour-preserving ───────
  describe('scoreAndAssign eligibility after extraction (Story 11-9)', () => {
    it('still relaxes HARD ROTATION_EQUITY when it is the only blocker (fallback intact)', async () => {
      // A month where every eligible employee hits a max-1-Saturday HARD rotation cap but the
      // Saturday slots still need staffing: the fallback must fill them with a soft warning, not
      // leave holes. (Reuses the spec's existing generation harness — see the sibling
      // 'generateMonthlyPlan' describe for the mock scaffold and helper builders.)
      const result = await generateWithRotationCappedSaturdays();
      expect(result.holes.filter((h) => h.shiftTypeCode === 'CHIR')).toHaveLength(0);
      expect(
        result.violations.soft.some((v) => v.category === 'ROTATION_EQUITY'),
      ).toBe(true);
    });

    it('produces identical output across two runs (determinism preserved)', async () => {
      const a = await generateDeterministicFixture();
      const b = await generateDeterministicFixture();
      expect(a.assignments).toEqual(b.assignments);
      expect(a.holes).toEqual(b.holes);
    });
  });
  ```
  > **Dev note for this task:** `generateWithRotationCappedSaturdays` and `generateDeterministicFixture` are thin wrappers over the spec's existing `generateMonthlyPlan` mock setup — build them next to the current generation-suite helpers (search the spec for `mockPrismaService.shift.findMany` and the existing month-generation `describe`), reusing the same `planningRule.findMany` / `shift.findMany` / `listShiftTypes` mocks. If the existing suite already has an equivalent rotation-fallback test, extend it in place rather than duplicating the harness.

  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -30`
  Expected: exit 0, no errors referencing `planning-generation.service.ts`.
  Then: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: `Tests:` all passed (existing generation suite green + the 2 new characterization tests), exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "refactor(KON-126): extract shared evaluateEligibility predicate (behaviour-preserving)"`

- [x] **Task 4: RED — integration specs for the repair pass** [AC: 1, 2, 3, 4]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add the block below at the end of the top-level `describe`. These fail until Task 5 wires `runLocalRepairPass` into `generateMonthlyPlan`.
  ```ts
  // ─── Story 11-9 — local-repair pass integration ───────────────────────────────
  describe('local-repair pass (Story 11-9)', () => {
    it('AC1 — fills a bin-packing hole a greedy-only pass leaves (strictly fewer holes)', async () => {
      // Fixture: two VET-only CHIR slots on different days + two VETs where the greedy order
      // strands one hole; the ejection chain (depth 2) resolves it. buildCounterExampleMonth
      // returns { templateId, month } wired into the standard generation mocks.
      const { holesWithoutRepair, holesWithRepair } = await runCounterExampleBothWays();
      expect(holesWithoutRepair).toBeGreaterThan(0);
      expect(holesWithRepair).toBeLessThan(holesWithoutRepair);
    });

    it('AC3 — the repair introduces no hard-rule violation', async () => {
      const result = await runCounterExampleWithRepair();
      expect(result.violations.hard).toHaveLength(0);
    });

    it('AC2 — an equity swap lowers the weekend imbalance without creating a hole', async () => {
      const { before, after } = await runEquityImbalanceFixture();
      expect(after.weekendSpread).toBeLessThan(before.weekendSpread);
      expect(after.holeCount).toBe(before.holeCount); // swaps never create holes
    });

    it('AC4 — holes are recomputed after the pass and each carries a reason', async () => {
      const result = await runCounterExampleWithRepair();
      for (const hole of result.holes) {
        expect(typeof hole.reason).toBe('string');
        expect(hole.reason.length).toBeGreaterThan(0);
      }
    });

    it('AC4 — generation is deterministic with the pass enabled (two identical runs)', async () => {
      const a = await runCounterExampleWithRepair();
      const b = await runCounterExampleWithRepair();
      expect(a.assignments).toEqual(b.assignments);
      expect(a.holes).toEqual(b.holes);
    });
  });
  ```
  > **Dev note for this task:** the `run*` helpers wrap the existing generation mock harness. `runCounterExampleBothWays` runs the same fixture twice — once with the repair pass short-circuited (temporarily via a spy on `runLocalRepairPass` resolving to a no-op, or a `{ enableRepair: false }` test hook you add in Task 5) and once normally — and returns each run's `stats.holeCount`. Build the fixtures beside the existing month-generation helpers; do not invent a new Prisma mock — extend the one the suite already uses (`mockPrismaService`). Keep every fixture deterministic (fixed employee ids, fixed template).
  Run: `pnpm --filter @pawly/api test -- planning-generation.service 2>&1 | tail -20`
  Expected: the 5 new tests **fail** (RED) — `runLocalRepairPass is not a function` / holes not reduced — while the pre-existing suite stays green. Do not commit a green claim here; this is the RED checkpoint.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-126): RED — local-repair pass integration specs"`

- [x] **Task 5: GREEN — implement `runLocalRepairPass`, counter-safe apply/revert, and recompute** [AC: 1, 2, 3, 4]
  In `apps/api/src/modules/planning/planning-generation.service.ts`.

  **(a) Import the pure module** immediately after the `./rule-engine` import block (currently ends at line 25):
  ```ts
  import {
    equityObjective,
    computeLoads,
    findEjectionChain,
    selectImprovingSwap,
    type RepairSlot,
    type RepairAssignment,
  } from './local-repair';
  ```

  **(b) Add the repair constants** next to the other `private static readonly` constants (after `EQUITY_WINDOW_MONTHS`, line ~107):
  ```ts
  // Story 11-9 — local-repair bounds (AC4). Depth is fixed at <=2 by findEjectionChain.
  private static readonly MAX_HILLCLIMB_ITERATIONS = 200;
  private static readonly REPAIR_YIELD_EVERY = 8; // mirror the generation-loop event-loop yield
  ```

  **(c) Call the pass between the greedy loop and persistence.** Anchor on the end of the slot loop and the `deletedEmployeeIds` block. Insert the call AFTER the loop closes (current line 584, the `}` ending `for (const slot of slots)`) and BEFORE the `// Story 11-1 — collect the employees whose GENERATED shifts...` comment (current line 586):
  ```ts
      // Story 11-9 — bounded GRASP local-repair pass. Runs on the fully-populated in-memory
      // counters, before persistence, so it can move GENERATED assignments the single greedy pass
      // could not. Mutates assignedShifts + every counter in lockstep; recomputes holes after.
      const repairedHoles = await this.runLocalRepairPass({
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
      });
      holes.length = 0;
      holes.push(...repairedHoles);
  ```
  > The persistence transaction below already writes `assignedShifts` (the repair pass appends/rewrites it), so no other change to the transaction is needed. `buildResult` is called with the mutated `holes`.

  **(d) Add the pass + its helpers** as private methods (place them after `scoreAndAssign` and its helpers, before `expandTemplateToMonth`, or grouped with the other private helpers near the end of the class — anywhere inside the class body):
  ```ts
  /**
   * Story 11-9 — bounded local-repair pass. Phase 1: hole-repair via depth-<=2 ejection chains.
   * Phase 2: equity hill-climbing swaps against equityObjective. Every candidate move is validated
   * with the shared evaluateEligibility predicate on pre-move state and applied through
   * applyAssignment/removeAssignment so all counters stay in lockstep. Returns the recomputed holes.
   */
  private async runLocalRepairPass(ctx: {
    employees: EmployeeInfo[];
    slots: SlotRequirement[];
    constraints: ConstraintMap;
    assignedShifts: AssignedShift[];
    allShiftsForScoring: AssignedShift[];
    assignmentIndex: Map<string, AssignedShift[]>;
    weeklyMinutesCounter: Map<string, number>;
    employeeMinutes: Map<string, number>;
    shiftTypeCounts: Map<string, Map<string, number>>;
    employeeShiftCounts: Map<string, number>;
    dayOfWeekCounts: Map<string, Map<number, number>>;
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>;
    preExistingSlotCoverage: Map<
      string,
      Array<{ startTime: string; endTime: string; jobType: string | null; consumed: boolean }>
    >;
    priorHoles: GenerationResult['holes'];
  }): Promise<GenerationResult['holes']> {
    const eligibilityCtx = {
      constraints: ctx.constraints,
      assignmentIndex: ctx.assignmentIndex,
      weeklyMinutesCounter: ctx.weeklyMinutesCounter,
      employeeMinutes: ctx.employeeMinutes,
      dayOfWeekCounts: ctx.dayOfWeekCounts,
      quarterlyDayOfWeekCounts: ctx.quarterlyDayOfWeekCounts,
    };
    const employeeById = new Map(ctx.employees.map((e) => [e.id, e]));
    const employeeIds = ctx.employees.map((e) => e.id).sort();

    // The injected predicate the pure search calls. Strict rotation (no greedy relaxation).
    const isEligible = (employeeId: string, rslot: RepairSlot): boolean => {
      const emp = employeeById.get(employeeId);
      if (!emp) return false;
      const slot: SlotRequirement = {
        date: rslot.date,
        shiftTypeCode: rslot.shiftTypeCode,
        startTime: rslot.startTime,
        endTime: rslot.endTime,
        breakMinutes: rslot.breakMinutes,
        requiredStaff: 1,
        requiredJobTypes: rslot.requiredJobTypes,
      };
      return this.evaluateEligibility(emp, slot, eligibilityCtx).eligible;
    };

    // Build the RepairSlot view (one per demand slot key) once; slot ids are deterministic.
    const slotIdOf = (date: string, shiftTypeCode: string, startTime: string): string =>
      `${date}|${shiftTypeCode}|${startTime}`;
    const slotById = new Map<string, RepairSlot>();
    for (const s of ctx.slots) {
      const id = slotIdOf(s.date, s.shiftTypeCode, s.startTime);
      if (!slotById.has(id)) {
        slotById.set(id, {
          id,
          date: s.date,
          shiftTypeCode: s.shiftTypeCode,
          startTime: s.startTime,
          endTime: s.endTime,
          breakMinutes: s.breakMinutes,
          requiredJobTypes: s.requiredJobTypes,
        });
      }
    }

    // ── Phase 1: hole-repair via ejection chains ────────────────────────────────
    let yields = 0;
    const holes = this.recomputeHoles(ctx.slots, ctx.assignedShifts, ctx.preExistingSlotCoverage, ctx.priorHoles);
    for (const hole of holes) {
      if (hole.assignedStaff >= hole.requiredStaff) continue;
      const holeSlot = slotById.get(slotIdOf(hole.date, hole.shiftTypeCode, this.slotStartFor(ctx.slots, hole)));
      if (!holeSlot) continue;
      if (++yields % PlanningGenerationService.REPAIR_YIELD_EVERY === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      const currentAssignments: RepairAssignment[] = ctx.assignedShifts.map((s) => ({
        slotId: slotIdOf(s.date, s.shiftTypeCode, s.startTime),
        employeeId: s.employeeId,
      }));
      const chain = findEjectionChain(holeSlot, currentAssignments, slotById, employeeIds, isEligible);
      if (!chain) continue;

      const moverShift = ctx.assignedShifts.find(
        (s) =>
          s.employeeId === chain.moverEmployeeId &&
          slotIdOf(s.date, s.shiftTypeCode, s.startTime) === chain.ejectFromSlotId,
      );
      const vacated = slotById.get(chain.ejectFromSlotId);
      if (!moverShift || !vacated) continue;

      // Apply: eject mover from its slot, place mover on the hole, backfill the vacated slot.
      this.removeAssignment(moverShift, ctx);
      const moverOnHole: AssignedShift = {
        employeeId: chain.moverEmployeeId,
        date: holeSlot.date,
        startTime: holeSlot.startTime,
        endTime: holeSlot.endTime,
        shiftTypeCode: holeSlot.shiftTypeCode,
        breakMinutes: holeSlot.breakMinutes,
      };
      const backfill: AssignedShift = {
        employeeId: chain.backfillEmployeeId,
        date: vacated.date,
        startTime: vacated.startTime,
        endTime: vacated.endTime,
        shiftTypeCode: vacated.shiftTypeCode,
        breakMinutes: vacated.breakMinutes,
      };
      this.applyAssignment(moverOnHole, ctx);
      this.applyAssignment(backfill, ctx);

      // Belt-and-suspenders: verify post-apply validity; revert the whole chain if invalid.
      const moverStillOk = this.evaluateEligibility(
        employeeById.get(chain.moverEmployeeId)!,
        { ...holeSlot, requiredStaff: 1 } as SlotRequirement,
        eligibilityCtx,
      ).eligible;
      if (!moverStillOk) {
        this.removeAssignment(backfill, ctx);
        this.removeAssignment(moverOnHole, ctx);
        this.applyAssignment(moverShift, ctx);
      }
    }

    // ── Phase 2: equity hill-climbing swaps ─────────────────────────────────────
    for (let iter = 0; iter < PlanningGenerationService.MAX_HILLCLIMB_ITERATIONS; iter++) {
      if (++yields % PlanningGenerationService.REPAIR_YIELD_EVERY === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      const assignments: RepairAssignment[] = ctx.assignedShifts.map((s) => ({
        slotId: slotIdOf(s.date, s.shiftTypeCode, s.startTime),
        employeeId: s.employeeId,
      }));
      const swap = selectImprovingSwap(assignments, slotById, isEligible);
      if (!swap) break; // local optimum reached — objective is monotone non-increasing

      const shiftA = ctx.assignedShifts.find(
        (s) => s.employeeId === swap.employeeA && slotIdOf(s.date, s.shiftTypeCode, s.startTime) === swap.slotIdA,
      );
      const shiftB = ctx.assignedShifts.find(
        (s) => s.employeeId === swap.employeeB && slotIdOf(s.date, s.shiftTypeCode, s.startTime) === swap.slotIdB,
      );
      const slotA = slotById.get(swap.slotIdA);
      const slotB = slotById.get(swap.slotIdB);
      if (!shiftA || !shiftB || !slotA || !slotB) break;

      this.removeAssignment(shiftA, ctx);
      this.removeAssignment(shiftB, ctx);
      this.applyAssignment(
        { employeeId: swap.employeeB, date: slotA.date, startTime: slotA.startTime, endTime: slotA.endTime, shiftTypeCode: slotA.shiftTypeCode, breakMinutes: slotA.breakMinutes },
        ctx,
      );
      this.applyAssignment(
        { employeeId: swap.employeeA, date: slotB.date, startTime: slotB.startTime, endTime: slotB.endTime, shiftTypeCode: slotB.shiftTypeCode, breakMinutes: slotB.breakMinutes },
        ctx,
      );
    }

    // AC4 — recompute holes from the final assignments; each keeps a visible reason.
    return this.recomputeHoles(ctx.slots, ctx.assignedShifts, ctx.preExistingSlotCoverage, ctx.priorHoles);
  }

  /** Story 11-9 — add a GENERATED assignment and increment EVERY live counter in lockstep. */
  private applyAssignment(
    shift: AssignedShift,
    ctx: {
      assignedShifts: AssignedShift[];
      allShiftsForScoring: AssignedShift[];
      assignmentIndex: Map<string, AssignedShift[]>;
      weeklyMinutesCounter: Map<string, number>;
      employeeMinutes: Map<string, number>;
      shiftTypeCounts: Map<string, Map<string, number>>;
      employeeShiftCounts: Map<string, number>;
      constraints: ConstraintMap;
      dayOfWeekCounts: Map<string, Map<number, number>>;
    },
  ): void {
    ctx.assignedShifts.push(shift);
    ctx.allShiftsForScoring.push(shift);
    const key = `${shift.employeeId}|${shift.date}`;
    ctx.assignmentIndex.set(key, [...(ctx.assignmentIndex.get(key) || []), shift]);

    const netMin = this.calculateShiftMinutes(shift.startTime, shift.endTime) - (shift.breakMinutes || 0);
    const weekKey = `${shift.employeeId}|${this.getWeekBounds(shift.date).start}`;
    ctx.weeklyMinutesCounter.set(weekKey, (ctx.weeklyMinutesCounter.get(weekKey) || 0) + netMin);
    ctx.employeeMinutes.set(shift.employeeId, (ctx.employeeMinutes.get(shift.employeeId) || 0) + netMin);

    let typeCounts = ctx.shiftTypeCounts.get(shift.employeeId);
    if (!typeCounts) {
      typeCounts = new Map();
      ctx.shiftTypeCounts.set(shift.employeeId, typeCounts);
    }
    typeCounts.set(shift.shiftTypeCode, (typeCounts.get(shift.shiftTypeCode) || 0) + 1);
    ctx.employeeShiftCounts.set(shift.employeeId, (ctx.employeeShiftCounts.get(shift.employeeId) || 0) + 1);

    const dow = new Date(`${shift.date}T00:00:00.000Z`).getUTCDay();
    const equity = this.getOrCreateEquityEntry(ctx.constraints.equityMap, shift.employeeId);
    if (dow === 6) equity.saturdayCount++;
    if (dow === 0 || dow === 6) equity.weekendCount++;
    this.incrementDayOfWeekCount(ctx.dayOfWeekCounts, shift.employeeId, shift.date);
  }

  /** Story 11-9 — remove a GENERATED assignment and decrement EVERY live counter in lockstep. */
  private removeAssignment(
    shift: AssignedShift,
    ctx: {
      assignedShifts: AssignedShift[];
      allShiftsForScoring: AssignedShift[];
      assignmentIndex: Map<string, AssignedShift[]>;
      weeklyMinutesCounter: Map<string, number>;
      employeeMinutes: Map<string, number>;
      shiftTypeCounts: Map<string, Map<string, number>>;
      employeeShiftCounts: Map<string, number>;
      constraints: ConstraintMap;
      dayOfWeekCounts: Map<string, Map<number, number>>;
    },
  ): void {
    const same = (a: AssignedShift, b: AssignedShift) =>
      a.employeeId === b.employeeId &&
      a.date === b.date &&
      a.startTime === b.startTime &&
      a.shiftTypeCode === b.shiftTypeCode;
    const removeOne = (arr: AssignedShift[]) => {
      const i = arr.findIndex((s) => same(s, shift));
      if (i >= 0) arr.splice(i, 1);
    };
    removeOne(ctx.assignedShifts);
    removeOne(ctx.allShiftsForScoring);
    const key = `${shift.employeeId}|${shift.date}`;
    const bucket = ctx.assignmentIndex.get(key);
    if (bucket) {
      const i = bucket.findIndex((s) => same(s, shift));
      if (i >= 0) bucket.splice(i, 1);
      if (bucket.length === 0) ctx.assignmentIndex.delete(key);
    }

    const netMin = this.calculateShiftMinutes(shift.startTime, shift.endTime) - (shift.breakMinutes || 0);
    const weekKey = `${shift.employeeId}|${this.getWeekBounds(shift.date).start}`;
    ctx.weeklyMinutesCounter.set(weekKey, (ctx.weeklyMinutesCounter.get(weekKey) || 0) - netMin);
    ctx.employeeMinutes.set(shift.employeeId, (ctx.employeeMinutes.get(shift.employeeId) || 0) - netMin);

    const typeCounts = ctx.shiftTypeCounts.get(shift.employeeId);
    if (typeCounts) typeCounts.set(shift.shiftTypeCode, (typeCounts.get(shift.shiftTypeCode) || 0) - 1);
    ctx.employeeShiftCounts.set(shift.employeeId, (ctx.employeeShiftCounts.get(shift.employeeId) || 0) - 1);

    const dow = new Date(`${shift.date}T00:00:00.000Z`).getUTCDay();
    const equity = this.getOrCreateEquityEntry(ctx.constraints.equityMap, shift.employeeId);
    if (dow === 6) equity.saturdayCount--;
    if (dow === 0 || dow === 6) equity.weekendCount--;
    this.decrementDayOfWeekCount(ctx.dayOfWeekCounts, shift.employeeId, shift.date);
  }

  /** Story 11-9 — inverse of incrementDayOfWeekCount (never goes below 0). */
  private decrementDayOfWeekCount(
    index: Map<string, Map<number, number>>,
    employeeId: string,
    dateStr: string,
  ): void {
    const iso = this.isoDayOf(dateStr);
    const byDay = index.get(employeeId);
    if (!byDay) return;
    byDay.set(iso, Math.max(0, (byDay.get(iso) || 0) - 1));
  }

  /**
   * Story 11-9 (AC4) — recompute holes from the final assignments + survivor coverage. Reuses the
   * loop's per-slot reason when a hole persists on the same (date, shiftTypeCode); falls back to a
   * coverage reason otherwise so every remaining hole is explained to the admin.
   */
  private recomputeHoles(
    slots: SlotRequirement[],
    assignedShifts: AssignedShift[],
    preExistingSlotCoverage: Map<
      string,
      Array<{ startTime: string; endTime: string; jobType: string | null; consumed: boolean }>
    >,
    priorHoles: GenerationResult['holes'],
  ): GenerationResult['holes'] {
    const priorReason = new Map(priorHoles.map((h) => [`${h.date}|${h.shiftTypeCode}`, h.reason]));
    // Aggregate demand per (date, shiftTypeCode).
    const demand = new Map<string, { slot: SlotRequirement; required: number }>();
    for (const s of slots) {
      const k = `${s.date}|${s.shiftTypeCode}`;
      const cur = demand.get(k);
      if (cur) cur.required += s.requiredStaff;
      else demand.set(k, { slot: s, required: s.requiredStaff });
    }
    // Coverage = generated assignments + survivor-covered positions, per key.
    const covered = new Map<string, number>();
    for (const a of assignedShifts) {
      const k = `${a.date}|${a.shiftTypeCode}`;
      covered.set(k, (covered.get(k) || 0) + 1);
    }
    for (const [k, bucket] of preExistingSlotCoverage) {
      const consumed = bucket.filter((c) => c.consumed).length;
      if (consumed > 0) covered.set(k, (covered.get(k) || 0) + consumed);
    }

    const holes: GenerationResult['holes'] = [];
    for (const [k, { slot, required }] of demand) {
      const assignedStaff = covered.get(k) || 0;
      if (assignedStaff < required) {
        holes.push({
          date: slot.date,
          shiftTypeCode: slot.shiftTypeCode,
          requiredStaff: required,
          assignedStaff,
          reason:
            priorReason.get(k) ??
            (assignedStaff === 0
              ? 'No eligible employee available after local repair'
              : `Only ${assignedStaff} of ${required} staff assigned after local repair`),
        });
      }
    }
    return holes;
  }

  /** Story 11-9 — resolve the demand slot's startTime for a recomputed hole (first matching slot). */
  private slotStartFor(slots: SlotRequirement[], hole: { date: string; shiftTypeCode: string }): string {
    const match = slots.find((s) => s.date === hole.date && s.shiftTypeCode === hole.shiftTypeCode);
    return match ? match.startTime : '00:00';
  }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -30`
  Expected: exit 0.
  Then: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: `Tests:` all passed — the 5 Task-4 integration tests now green plus the full pre-existing suite, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-126): GRASP local-repair pass — ejection chains + equity hill-climb (GREEN)"`

- [x] **Task 6: NFR2 — stress the pass at 50 employees (< 2s) and confirm the event-loop yield** [AC: 4]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add the block below at the end of the top-level `describe`. It pins that the repair pass does not blow the NFR2 budget at the NFR9 scale and that it yields the event loop.
  ```ts
  // ─── Story 11-9 — NFR2/NFR9 stress ────────────────────────────────────────────
  describe('local-repair pass performance (Story 11-9, NFR2/NFR9)', () => {
    it('generates a 50-employee, 24/7, 31-day month within the 2s budget', async () => {
      // buildStressConfig = 50 employees, a CHIR/ACC/VET 3-slot 24/7 template, one live SOFT
      // ROTATION_EQUITY rule so the hot path is exercised (mirror 11-10's stress harness).
      const start = Date.now();
      const result = await generateStressMonth();
      const elapsedMs = Date.now() - start;
      expect(elapsedMs).toBeLessThan(2000);
      expect(result.stats.totalSlots).toBeGreaterThan(0);
    });

    it('yields the event loop during the pass (setImmediate scheduled)', async () => {
      const setImmediateSpy = jest.spyOn(global, 'setImmediate');
      await generateStressMonth();
      expect(setImmediateSpy).toHaveBeenCalled();
      setImmediateSpy.mockRestore();
    });
  });
  ```
  > **Dev note for this task:** reuse 11-10's stress harness verbatim if it exists in the spec (`generateStressMonth` / `buildStressConfig`); Story 11-10's outcome notes it needed a `listShiftTypes` mock override + one live SOFT ROTATION_EQUITY rule to exercise the hot path. If the 2s budget is flaky on CI, keep the assertion but widen to `< 2000` only after confirming a median run is well under it locally — do NOT delete the assertion (that would silence the NFR).
  Run: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: `Tests:` all passed (stress + yield green), exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-126): NFR2/NFR9 stress for the local-repair pass"`

- [x] **Task 7: Final verification — full type-check + full API suite + docs** [AC: 1, 2, 3, 4]
  Confirm the whole module compiles and every test is green, then update the algorithm reference so the documented "greedy is incomplete" limitation notes the repair pass.

  **(a) Update `docs/reference/planning-algorithm-reference.md`** — replace the first bullet of "## Known Algorithm Limitations" (currently: `1. **Greedy with no backtracking**: The algorithm never revisits a decision. If a bad choice is made early, it cannot be corrected later.`) with:
  ```markdown
  1. **Greedy with a bounded local-repair pass (Story 11-9)**: The greedy assignment never revisits a decision mid-pass, but after the pass a bounded GRASP local-repair runs: depth-≤2 ejection chains fill holes a single pass strands (bin-packing counter-example), and equity hill-climbing swaps rebalance weekend/Saturday load — every move re-validated through the shared eligibility predicate so no repair introduces a hard-rule violation. It is not a global optimum (CP-SAT remains a Phase-3 item), but it closes the proven incompleteness gap.
  ```

  Run (all three, in order):
  - `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json` → exit 0.
  - `pnpm --filter @pawly/api test -- local-repair` → all passed, exit 0.
  - `pnpm --filter @pawly/api test -- planning` → the whole planning module suite green (generation service + rule-engine + planning service + local-repair), exit 0.
  Expected: three green runs, no failures, no `tsc` errors.
  Commit: `git add apps/api/src/modules/planning/ docs/reference/planning-algorithm-reference.md && git commit -m "docs(KON-126): note the GRASP local-repair pass in the algorithm reference"`

## Dev Notes

- **Architecture:** Backend-only story in the NestJS planning module (`apps/api/src/modules/planning/`). No tRPC/router/web change — `generateMonthlyPlan` keeps its signature and `GenerationResult` shape; the pass runs entirely in-memory before the persistence transaction, so the data-flow contract (`Page → … → tRPC → NestJS`) is untouched. Follows the 11-8 precedent: the decision core is a **pure, framework-free, isolation-tested module** (`local-repair.ts`) beside `rule-engine.ts` / `french-labor-law.ts`; the service owns state, counters, and I/O.
- **Insertion point (exact):** between the end of the greedy slot loop (`planning-generation.service.ts:584`, the `}` closing `for (const slot of slots)`) and the amendment/persistence section (`:586` onward). The persistence `$transaction` (`:614-673`) already writes `assignedShifts`, which the pass mutates in place.
- **Determinism (invariant #3):** the generator has no RNG (tiebreakers `score → #shifts → #weekends → employeeId`). The pass must not add one — all iteration is over sorted keys (`date → shiftTypeCode → startTime → employeeId`). The two determinism tests (Task 3 + Task 4) are the guard.
- **Counter lockstep (11-7 + 11-10):** `applyAssignment` / `removeAssignment` are the ONLY mutation path in the pass and update every counter the greedy loop maintains — `assignmentIndex`, `allShiftsForScoring`, `weeklyMinutesCounter`, `employeeMinutes`, `shiftTypeCounts`, `employeeShiftCounts`, `equityMap.{saturdayCount,weekendCount}`, `dayOfWeekCounts`. `quarterlyDayOfWeekCounts` is fixed history — never mutated. Miss one and scoring/eligibility silently desyncs.
- **Shared evaluator (11-8) + statutory (11-3):** `evaluateEligibility` delegates the contract/rotation decision to `rule-engine.ts` (`violatesHardContractIncremental`, `violatesHardRotation` via `violatesHardRotationEquity`) and the labor-law decision to `french-labor-law.ts` (`wouldExceedStatutory`). The pass introduces **no** new rule logic — it reuses the exact predicate `scoreAndAssign` uses (that is the whole point of extracting it in Task 3).
- **Conservative eligibility:** validity is checked on pre-move live state; because removing an assignment only relaxes per-employee constraints, a passing check is guaranteed valid post-move. `runLocalRepairPass` still re-checks after applying an ejection and reverts on the (theoretically unreachable) invalid case.
- **Testing:** API = **Jest** `*.spec.ts` (NOT Vitest). Run per-file with `pnpm --filter @pawly/api test -- <pattern>` from the repo root (NEVER `cd apps/api`). `date-fns` is not installed in `apps/api` — the module uses native UTC `Date` arithmetic (matches `getWeekBounds` / `isoDayOf`). Rebuild `@pawly/*` dist before an app-wide `tsc` if you touch validators (this story does not).
- **Dependencies:** consumes `./rule-engine` (11-8, KON-125) and `./french-labor-law` (11-3, KON-120) — both already merged into this worktree's base (`sprint/epic-11 @ bc447e4`). No new npm packages. No Prisma schema change (survivors + `@@unique` from 11-2 already exist; the pass writes only GENERATED shifts through the existing transaction).
- **Commit prefix:** `feat(KON-126): …` / `test(KON-126): …` / `refactor(KON-126): …` / `docs(KON-126): …`.

### File decisions (3-bullet per file)

- **`apps/api/src/modules/planning/local-repair.ts`** (NEW, pure)
  - *Responsibility:* decide which repair moves to try (deterministic ejection-chain + equity-swap search) and score the global equity objective — nothing else.
  - *Inputs:* `RepairSlot` / `RepairAssignment` views + an injected `IsEligible` predicate. *Outputs:* `equityObjective`, `computeLoads`, `findEjectionChain`, `selectImprovingSwap` + the `RepairSlot`/`RepairAssignment`/`EmployeeLoad`/`EjectionChain`/`EquitySwap`/`IsEligible` types. No imports.
- **`apps/api/src/modules/planning/local-repair.spec.ts`** (NEW)
  - *Responsibility:* prove the pure module in isolation — objective, the bin-packing ejection counter-example, and strictly-improving swap selection.
  - *Inputs:* the module's exports. *Outputs:* Jest suite (≥ 8 cases).
- **`apps/api/src/modules/planning/planning-generation.service.ts`** (MODIFY)
  - *Responsibility:* extract `evaluateEligibility` (shared with `scoreAndAssign`), run the pass between loop and persistence, mutate counters in lockstep, recompute holes.
  - *Inputs:* `local-repair.ts`, `rule-engine.ts`, `french-labor-law.ts`, the live generation counters. *Outputs:* an unchanged `GenerationResult` (holes now recomputed post-repair).
- **`apps/api/src/modules/planning/planning-generation.service.spec.ts`** (MODIFY)
  - *Responsibility:* characterization (extraction is behaviour-preserving) + integration (counter-example filled, no hard violation, determinism, recomputed reasons) + NFR2/NFR9 stress.
  - *Inputs:* the service + the existing generation mock harness. *Outputs:* Jest suite additions.

### Existing code at write time (Step-0 verbatim quotes — re-verify the symbol, line numbers may drift)

`planning-generation.service.ts:990-1008` (current) — `scoreAndAssign` signature + return shape the pass and Task 3 depend on:
```ts
  private scoreAndAssign(
    slot: SlotRequirement,
    employees: EmployeeInfo[],
    constraints: ConstraintMap,
    alreadyAssigned: AssignedShift[],
    assignmentIndex: Map<string, AssignedShift[]>,
    employeeMinutes: Map<string, number>,
    weeksInMonth: number,
    weeklyMinutesCounter: Map<string, number>,
    shiftTypeCounts: Map<string, Map<string, number>>,
    employeeShiftCountsMap: Map<string, number>,
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
  ): {
    assigned: AssignedShift[];
    holeInfo?: GenerationResult['holes'][number];
    hardViolations: GenerationResult['violations']['hard'];
    softViolations: GenerationResult['violations']['soft'];
  } {
```

`planning-generation.service.ts:1034-1080` (current) — the eligibility filter Task 3 extracts (rotation-fallback bucket, HARD rotation, HARD contract via the unified engine). Reproduced through the contract check; the full block extends to `:1170` (statutory) and is replaced wholesale in Task 3(b):
```ts
    // Filter eligible employees — track rotation-equity-blocked separately for fallback
    const rotationEquityBlocked: EmployeeInfo[] = [];
    const eligible = employees.filter((emp) => {
      const unavailDates = constraints.unavailableMap.get(emp.id);
      if (unavailDates?.has(slot.date)) return false;

      const key = `${emp.id}|${slot.date}`;
      const existingOnDate = assignmentIndex.get(key) || [];
      for (const existing of existingOnDate) {
        if (
          this.timesOverlap(
            slot.startTime,
            slot.endTime,
            existing.startTime,
            existing.endTime,
          )
        ) {
          return false;
        }
      }
      // ... requiredJobTypes, HARD ROTATION_EQUITY (sets blockedByRotationEquity),
      //     HARD CONTRACT_COMPLIANCE via violatesHardContractIncremental + minRest,
      //     French statutory via wouldExceedStatutory, then:
      // if (blockedByRotationEquity) { rotationEquityBlocked.push(emp); return false; }
      // return true;
    });
```

`planning-generation.service.ts:517-584` (current) — the slot loop the pass is inserted after (call + counter lockstep + hole collection):
```ts
      const result = this.scoreAndAssign(
        { ...slot, requiredStaff: effectiveRequiredStaff },
        employees,
        constraints,
        allShiftsForScoring,
        assignmentIndex,
        employeeMinutes,
        weeksInMonth,
        weeklyMinutesCounter,
        shiftTypeCounts,
        employeeShiftCounts,
        dayOfWeekCounts,
        quarterlyDayOfWeekCounts,
      );

      assignedShifts.push(...result.assigned);
      allShiftsForScoring.push(...result.assigned);
      for (const a of result.assigned) {
        // ... update assignmentIndex, weeklyMinutesCounter, shiftTypeCounts,
        //     employeeShiftCounts, equityMap (saturday/weekend), dayOfWeekCounts
      }
      if (result.holeInfo) holes.push(result.holeInfo);
      hardViolations.push(...result.hardViolations);
      softViolations.push(...result.softViolations);
    }
```

`planning-generation.service.ts:3384-3400` (current) — `buildResult` (receives the pass's recomputed `holes`; unchanged):
```ts
    return {
      assignments,
      holes,
      violations: {
        hard: hardViolations,
        soft: softViolations,
      },
      stats: {
        totalSlots: totalPositions,
        filledSlots: assignments.length + survivorCoveredPositions,
        holeCount: holes.length,
        hardViolationCount: hardViolations.length,
        softWarningCount: softViolations.length,
      },
    };
```

`local-repair.ts` — **new file, no existing code.**

## File List

_Expected files (the dev agent updates this to the actual set on completion):_

- `apps/api/src/modules/planning/local-repair.ts` — CREATE (pure GRASP search module)
- `apps/api/src/modules/planning/local-repair.spec.ts` — CREATE (isolated unit tests)
- `apps/api/src/modules/planning/planning-generation.service.ts` — MODIFY (extract `evaluateEligibility`, add `runLocalRepairPass` + apply/revert + recompute)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — MODIFY (characterization + integration + NFR2/NFR9 stress)
- `docs/reference/planning-algorithm-reference.md` — MODIFY (note the local-repair pass in Known Limitations)

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-12
- **Completed:** 2026-07-13

### Summary

Shipped the bounded GRASP local-repair pass as a pure, framework-free module (`local-repair.ts`, beside `rule-engine.ts` / `french-labor-law.ts`) plus the service wiring (`runLocalRepairPass`). Phase 1 fills holes a single greedy pass strands via depth-≤2 ejection chains; Phase 2 rebalances weekend/Saturday load via equity hill-climbing swaps against an explicit sum-of-squared-deviations objective. Every move is re-validated through the shared `evaluateEligibility` predicate (extracted in Task 3) and the live counters are mutated in lockstep with a belt-and-suspenders revert. Scope held; four grounded deviations below (all preserve the ACs and determinism).

### Files changed

- `apps/api/src/modules/planning/local-repair.ts` — CREATE (pure GRASP search: `computeLoads`, `equityObjective`, `findEjectionChain`, `selectImprovingSwap`)
- `apps/api/src/modules/planning/local-repair.spec.ts` — CREATE (8 isolated unit tests, AC1 + AC2)
- `apps/api/src/modules/planning/planning-generation.service.ts` — MODIFY (`evaluateEligibility` extraction; `runLocalRepairPass` + counter-safe apply/remove + `recomputeHoles`)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — MODIFY (eligibility characterization + AC1/AC3/AC4 integration + NFR2/NFR9 stress)
- `docs/reference/planning-algorithm-reference.md` — MODIFY (Known Limitations bullet 1 → local-repair pass; bullet 4 → deterministic tiebreaker)

### Deviations

- **Ejection mover evaluated on POST-removal state** (`isMoverEligibleForHole`), revising the story's locked "conservative pre-move" scope decision. A hole exists precisely because no one is eligible on the current state, so a pre-move check can never let a capped mover reach the hole it can only fill after leaving its own slot — AC1 would be unsatisfiable. User approved ("Corriger la conception"). `findEjectionChain` gained a 6th predicate param; the module stays pure and unit-tested (removing a shift only relaxes constraints, so the check stays sound).
- **AC1 counter-example fixture rebuilt.** The Task-4 fixture stranded no *fillable* hole: the MRV slot ordering counts eligibility by availability + jobType only (never the contract cap) and processes ISO weeks in order. Replaced with a genuine MRV-defeating case — two Mondays in different ISO weeks (others closed), a HARD *monthly* 4h cap (invisible to the MRV count), and Bob on VACATION the second Monday.
- **`selectImprovingSwap` internals optimized to O(A²)** (O(1)-per-pair objective delta since means/shiftCount are swap-invariant, plus rule-engine eligibility memoization and a delta-gate before the eligibility check) to hold NFR2 — the 50-employee 24/7 month dropped from ~7.7 s to ~0.2 s. The swap selected is identical, so every Task-1 unit test passes unchanged.
- **Reference doc bullet 4 corrected** ("Random tiebreaker" → deterministic) — the RNG claim contradicted the determinism AC4 now guarantees. Also adjusted unit test #8's fixture (block e2 from both weekend days) because the weekendCount term made the Sunday swap eligible + improving, so the original `toBeNull()` needed a fully-blocked weekend.

### Test output

```
# pnpm --filter @pawly/api test   (full API suite, this session)
Test Suites: 36 passed, 36 total
Tests:       989 passed, 989 total

# Story 11-9 slice — 8 unit (local-repair.spec) + 6 integration + 2 NFR2/NFR9 stress, all green.
# NFR2: 50-employee / 24-7 / 31-day month generates in ~0.2s (< 2s budget).
# tsc -p apps/api: 0 errors in planning files (24 pre-existing baseline errors in unrelated specs unchanged).
```
