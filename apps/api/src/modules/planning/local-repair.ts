/**
 * Pure local-repair search — Story 11-9 (KON-126), extended by KON-128.
 *
 * A single greedy pass (PlanningGenerationService.generateMonthlyPlan) never revisits a
 * decision, so it can leave a hole that a fuller feasible assignment would avoid (bin-packing
 * counter-example, documented in planning-algorithm-reference.md §321-331). This module is the
 * pure decision core of a bounded GRASP-style local-repair pass that runs after the greedy loop:
 *
 *   1. hole-repair via ejection chains of depth <= 3 (relocate one — or, when that fails, two —
 *      assigned employees onto the hole/vacated slots and backfill the last vacated slot with an
 *      idle one) — the moves a greedy pass cannot make. Depth 2 is searched first and wins when
 *      it exists; the depth-3 fallback (KON-128) runs only on a depth-2 miss, behind an explicit
 *      evaluation budget so worst-case cost stays bounded;
 *   2. equity hill-climbing swaps against an explicit global objective, scale-normalized per
 *      metric and weighted from the clinic's ROTATION_EQUITY rule priorities (KON-128).
 *
 * Pure: no NestJS, no Prisma, no I/O (same discipline as rule-engine.ts / french-labor-law.ts).
 * The service injects the eligibility predicates (built on the SAME evaluateEligibility scoreAndAssign
 * uses) and applies/reverts the moves against its live counters. Additions (backfill, swap) are
 * checked on pre-apply state — sound, since adding a shift only tightens constraints. Every ejection
 * MOVER is checked on POST-removal state of its OWN slot (isMoverEligible): a hole exists precisely
 * because no one is eligible on the current state, so a pre-move check would never let a capped mover
 * reach the slot it could fill after leaving its own. Removing only relaxes, and eligibility depends
 * only on the mover's own counters, so this stays sound at depth 3: the first mover's relocation
 * never changes what the second mover may do.
 *
 * Determinism (invariant #3): every iteration is over deterministically-sorted keys, no RNG; the
 * depth-3 budget counts predicate evaluations, never wall-clock.
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

/** One relocation inside an ejection chain: `employeeId` leaves `fromSlotId` for `toSlotId`. */
export interface EjectionMove {
  employeeId: string;
  fromSlotId: string;
  toSlotId: string;
}

/**
 * An ejection chain: moves[0] fills the hole, each subsequent move fills the slot vacated by the
 * previous one, and an idle backfill takes the last vacated slot. One move = the original depth-2
 * chain; two moves = the KON-128 depth-3 fallback.
 */
export interface EjectionChain {
  holeSlotId: string;
  moves: EjectionMove[];
  backfillEmployeeId: string;
  /** Slot the idle backfill lands on — always the last move's `fromSlotId`. */
  backfillSlotId: string;
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

/**
 * Injected validity predicate for an ejection MOVER — whether `moverEmployeeId` may take `target`
 * once it has LEFT `vacated` (its own current slot). The service evaluates it on the post-removal
 * state (the vacated shift discounted from the live counters), because a hole exists precisely
 * because no one is eligible for it on the current state — checking the mover pre-move would
 * falsely reject a mover whose own vacated slot is the only thing over its cap. Sound: leaving a
 * slot only relaxes constraints, and eligibility reads only the mover's own counters.
 */
export type MoverEligibility = (
  moverEmployeeId: string,
  target: RepairSlot,
  vacated: RepairSlot,
) => boolean;

/** Weights of the three equity-objective terms. Derived per clinic via deriveEquityWeights. */
export interface EquityWeights {
  saturday: number;
  weekend: number;
  shift: number;
}

export const DEFAULT_EQUITY_WEIGHTS: EquityWeights = Object.freeze({
  saturday: 1,
  weekend: 1,
  shift: 1,
});

/** Minimal structural view of a PlanningRule that weight derivation reads. */
export interface RotationRuleLike {
  category: string;
  config: Record<string, unknown>;
  priority: number;
}

/**
 * Depth-3 search budget, counted in eligibility-predicate evaluations (deterministic — never
 * wall-clock). The depth-2 scan is NOT budgeted: it preserves the pre-KON-128 behavior exactly.
 * The budget is a MUTABLE ref decremented in place so the caller can share ONE budget across a
 * whole repair pass (many holes): without sharing, a scarce month with many depth-2-unrepairable
 * holes would pay the full budget per hole and blow the pass's perf envelope (NFR2). A successful
 * depth-3 chain costs a few dozen evaluations, so the default leaves room for many repairs while
 * bounding the worst case to a few hundred ms of rule-engine work.
 */
export const DEFAULT_DEPTH3_EVALUATION_BUDGET = 4_000;

export interface EjectionSearchOptions {
  /** Shared, mutable evaluation budget. Omitted → a fresh default budget for this call only. */
  depth3Budget?: { remaining: number };
}

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
    const cur = loads.get(a.employeeId) ?? {
      saturdayCount: 0,
      weekendCount: 0,
      shiftCount: 0,
    };
    cur.saturdayCount += c.saturdayCount;
    cur.weekendCount += c.weekendCount;
    cur.shiftCount += c.shiftCount;
    loads.set(a.employeeId, cur);
  }
  return loads;
}

/**
 * Derive the equity-objective weights from the clinic's ROTATION_EQUITY rules (KON-128).
 * A rule targeting saturday boosts the saturday term, one targeting sunday boosts the weekend
 * term, each via the codebase-wide soft-penalty convention `1 + priority/10` (max across rules).
 * Other target days are invisible to the objective (it only tracks saturday/weekend/shift), and
 * the shift term always stays at 1 — it is the neutral baseline the boosts are relative to.
 */
export function deriveEquityWeights(rules: RotationRuleLike[]): EquityWeights {
  let saturdayPriority = -1;
  let weekendPriority = -1;
  for (const rule of rules) {
    if (rule.category !== 'ROTATION_EQUITY') continue;
    const targetDay = rule.config.targetDay;
    if (targetDay === 'saturday') {
      saturdayPriority = Math.max(saturdayPriority, rule.priority);
    } else if (targetDay === 'sunday') {
      weekendPriority = Math.max(weekendPriority, rule.priority);
    }
  }
  return {
    saturday: saturdayPriority >= 0 ? 1 + saturdayPriority / 10 : 1,
    weekend: weekendPriority >= 0 ? 1 + weekendPriority / 10 : 1,
    shift: 1,
  };
}

/**
 * Explicit global equity objective (LOWER is fairer): the weighted sum of squared RELATIVE
 * deviations of each employee's saturdayCount / weekendCount / shiftCount from their respective
 * workforce means. Each term is normalized by its mean (KON-128) so a ±1 deviation on a rare
 * metric (saturdays, mean ≈ 1) outweighs a ±1 deviation on an abundant one (shifts, mean ≈ 20) —
 * unnormalized, the shift term drowned the weekend fairness clinics configure rules for. A zero
 * mean divides by 1 instead (the metric is absent, its deviations are all 0 anyway). Pure function
 * of the load map — deterministic. 0 iff every metric is identical across employees.
 *
 * Scope: the caller builds the load map from the GENERATED assignments only. Survivor (MANUAL /
 * confirmed) and border-week shifts are immovable and out of scope (story §36), so the objective
 * is deliberately blind to their load — it rebalances what the pass can actually move. Eligibility,
 * by contrast, DOES account for survivors (via the live counters), so this blindness only affects
 * fairness quality, never validity.
 */
export function equityObjective(
  loads: Map<string, EmployeeLoad>,
  weights: EquityWeights = DEFAULT_EQUITY_WEIGHTS,
): number {
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
  const kSat = weights.saturday / (meanSat > 0 ? meanSat * meanSat : 1);
  const kWeekend =
    weights.weekend / (meanWeekend > 0 ? meanWeekend * meanWeekend : 1);
  const kShift = weights.shift / (meanShift > 0 ? meanShift * meanShift : 1);
  let obj = 0;
  for (const l of loads.values()) {
    obj += kSat * (l.saturdayCount - meanSat) ** 2;
    obj += kWeekend * (l.weekendCount - meanWeekend) ** 2;
    obj += kShift * (l.shiftCount - meanShift) ** 2;
  }
  return obj;
}

/**
 * Ejection-chain search for a single hole: depth 2 first, depth-3 fallback on a miss (KON-128).
 *
 * Depth 2 scans the current assignments in deterministic order; for each candidate mover eligible
 * for the hole ONCE IT HAS LEFT its slot (isMoverEligible, post-removal state), it scans employees
 * in deterministic order for a backfill eligible for the vacated slot (excluding the mover) and
 * returns the first such chain. This phase is identical to the pre-KON-128 search — same order,
 * same result — so any hole a depth-2 chain could fix is fixed by the same chain as before.
 *
 * The depth-3 fallback relocates a second mover onto the first mover's vacated slot before the
 * idle backfill takes the second vacated slot. Each mover is validated post-removal of its OWN
 * slot only — sound, because eligibility reads only that employee's counters, so the first
 * relocation cannot invalidate the second (the service's isAppliedShiftValid revert is the
 * belt-and-suspenders for anything this reasoning misses). The phase is budgeted: every predicate
 * evaluation decrements `depth3EvaluationBudget` (default DEFAULT_DEPTH3_EVALUATION_BUDGET) and
 * exhaustion aborts the search deterministically. Addition probes are memoized within the scan —
 * the state is frozen during the search, so (employee, slot) verdicts are stable; memo hits are free.
 */
export function findEjectionChain(
  hole: RepairSlot,
  assignments: RepairAssignment[],
  slotById: Map<string, RepairSlot>,
  employees: string[],
  isEligible: IsEligible,
  isMoverEligible: MoverEligibility,
  options?: EjectionSearchOptions,
): EjectionChain | null {
  const sortedEmployees = [...employees].sort();
  // Deterministic mover order: by the vacated slot's (date, shiftTypeCode, startTime), then employeeId.
  const sortedAssignments = [...assignments].sort((x, y) => {
    const sx = slotById.get(x.slotId);
    const sy = slotById.get(y.slotId);
    const kx = sx ? `${sx.date}|${sx.shiftTypeCode}|${sx.startTime}` : x.slotId;
    const ky = sy ? `${sy.date}|${sy.shiftTypeCode}|${sy.startTime}` : y.slotId;
    return kx === ky
      ? x.employeeId.localeCompare(y.employeeId)
      : kx.localeCompare(ky);
  });

  // ── Depth 2 (unbudgeted — byte-for-byte the pre-KON-128 search) ──────────────
  for (const mover of sortedAssignments) {
    if (mover.slotId === hole.id) continue; // already on the hole slot
    const vacated = slotById.get(mover.slotId);
    if (!vacated) continue;
    if (!isMoverEligible(mover.employeeId, hole, vacated)) continue;
    for (const backfill of sortedEmployees) {
      if (backfill === mover.employeeId) continue;
      if (isEligible(backfill, vacated)) {
        return {
          holeSlotId: hole.id,
          moves: [
            {
              employeeId: mover.employeeId,
              fromSlotId: mover.slotId,
              toSlotId: hole.id,
            },
          ],
          backfillEmployeeId: backfill,
          backfillSlotId: mover.slotId,
        };
      }
    }
  }

  // ── Depth-3 fallback (KON-128) — budgeted, first-fit, deterministic ─────────
  const budget = options?.depth3Budget ?? {
    remaining: DEFAULT_DEPTH3_EVALUATION_BUDGET,
  };
  let exhausted = budget.remaining <= 0;

  const probeMover = (
    emp: string,
    target: RepairSlot,
    vacated: RepairSlot,
  ): boolean => {
    if (exhausted) return false;
    if (budget.remaining <= 0) {
      exhausted = true;
      return false;
    }
    budget.remaining--;
    return isMoverEligible(emp, target, vacated);
  };
  const additionMemo = new Map<string, boolean>();
  const probeAddition = (emp: string, slot: RepairSlot): boolean => {
    const key = `${emp}|${slot.id}`;
    const memo = additionMemo.get(key);
    if (memo !== undefined) return memo;
    if (exhausted) return false;
    if (budget.remaining <= 0) {
      exhausted = true;
      return false;
    }
    budget.remaining--;
    const verdict = isEligible(emp, slot);
    additionMemo.set(key, verdict);
    return verdict;
  };

  for (const first of sortedAssignments) {
    if (exhausted) break;
    if (first.slotId === hole.id) continue;
    const firstVacated = slotById.get(first.slotId);
    if (!firstVacated) continue;
    if (!probeMover(first.employeeId, hole, firstVacated)) continue;
    for (const second of sortedAssignments) {
      if (exhausted) break;
      if (second.employeeId === first.employeeId) continue;
      if (second.slotId === first.slotId || second.slotId === hole.id) continue;
      const secondVacated = slotById.get(second.slotId);
      if (!secondVacated) continue;
      if (!probeMover(second.employeeId, firstVacated, secondVacated)) continue;
      for (const backfill of sortedEmployees) {
        if (exhausted) break;
        if (backfill === first.employeeId || backfill === second.employeeId)
          continue;
        if (probeAddition(backfill, secondVacated)) {
          return {
            holeSlotId: hole.id,
            moves: [
              {
                employeeId: first.employeeId,
                fromSlotId: first.slotId,
                toSlotId: hole.id,
              },
              {
                employeeId: second.employeeId,
                fromSlotId: second.slotId,
                toSlotId: first.slotId,
              },
            ],
            backfillEmployeeId: backfill,
            backfillSlotId: second.slotId,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Best-improvement equity swap: over all ordered assignment pairs (a before b by slot key then
 * employeeId), pick the eligible swap that yields the greatest strict decrease of equityObjective
 * under the given weights. Deterministic: pairs are scanned in `keyOf` order
 * (date|shiftTypeCode|startTime|employeeId) and a strict-`<` gate keeps the first pair on equal
 * deltas. Returns null when no eligible swap improves the objective. Eligibility is evaluated on
 * pre-move state (conservative — see module header).
 *
 * Each candidate pair is scored in O(1) as a delta off the base objective rather than recomputing
 * the whole objective, so the scan is O(A²) not O(A³) (NFR2, Story 11-10). This is exact, not an
 * approximation: a swap exchanges which employee holds two slots, so every workforce total (each
 * slot stays assigned) and every employee's shiftCount (each keeps one of the two slots) is
 * preserved. The objective means — hence the per-term normalization factors — are therefore
 * constant, the (weighted, normalized) shift term never moves, and only the two swapped employees'
 * saturday/weekend terms change: the delta below equals
 * equityObjective(after, weights) − equityObjective(before, weights).
 */
export function selectImprovingSwap(
  assignments: RepairAssignment[],
  slotById: Map<string, RepairSlot>,
  isEligible: IsEligible,
  weights: EquityWeights = DEFAULT_EQUITY_WEIGHTS,
): EquitySwap | null {
  const baseLoads = computeLoads(assignments, slotById);
  const n = baseLoads.size;
  if (n === 0) return null;
  let sumSat = 0;
  let sumWeekend = 0;
  for (const l of baseLoads.values()) {
    sumSat += l.saturdayCount;
    sumWeekend += l.weekendCount;
  }
  const meanSat = sumSat / n;
  const meanWeekend = sumWeekend / n;
  // Weighted normalization factors — constant under any swap (totals are preserved).
  const kSat = weights.saturday / (meanSat > 0 ? meanSat * meanSat : 1);
  const kWeekend =
    weights.weekend / (meanWeekend > 0 ? meanWeekend * meanWeekend : 1);
  const sq = (x: number): number => x * x;

  // Cache each slot's weekday contribution once (the date parse in slotContribution is otherwise
  // repeated per pair — O(A²) parses).
  const contribById = new Map<string, EmployeeLoad>();
  for (const [id, s] of slotById) contribById.set(id, slotContribution(s));

  // Memoize the (rule-engine-heavy) eligibility within this scan. The counters isEligible closes
  // over are frozen for the whole scan, so (employee, slot) → boolean is stable; caching bounds the
  // distinct rule evaluations at E×S instead of the ~2·A² call sites below.
  const eligMemo = new Map<string, boolean>();
  const elig = (employeeId: string, slot: RepairSlot): boolean => {
    const k = `${employeeId}|${slot.id}`;
    let v = eligMemo.get(k);
    if (v === undefined) {
      v = isEligible(employeeId, slot);
      eligMemo.set(k, v);
    }
    return v;
  };

  const keyOf = (a: RepairAssignment): string => {
    const s = slotById.get(a.slotId);
    return s
      ? `${s.date}|${s.shiftTypeCode}|${s.startTime}|${a.employeeId}`
      : `${a.slotId}|${a.employeeId}`;
  };
  const sorted = [...assignments].sort((x, y) =>
    keyOf(x).localeCompare(keyOf(y)),
  );

  let best: EquitySwap | null = null;
  let bestDelta = -OBJECTIVE_EPSILON; // the objective must strictly decrease

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
      const cA = contribById.get(a.slotId)!;
      const cB = contribById.get(b.slotId)!;
      if (
        cA.saturdayCount === cB.saturdayCount &&
        cA.weekendCount === cB.weekendCount
      )
        continue;

      const la = baseLoads.get(a.employeeId)!;
      const lb = baseLoads.get(b.employeeId)!;
      // After the swap: A gives up cA and takes cB; B gives up cB and takes cA. shiftCount and the
      // means are unchanged, so only these four squared-deviation terms move — each scaled by its
      // term's weighted normalization factor.
      const delta =
        kSat *
          (sq(
            la.saturdayCount - cA.saturdayCount + cB.saturdayCount - meanSat,
          ) -
            sq(la.saturdayCount - meanSat) +
            sq(
              lb.saturdayCount - cB.saturdayCount + cA.saturdayCount - meanSat,
            ) -
            sq(lb.saturdayCount - meanSat)) +
        kWeekend *
          (sq(
            la.weekendCount - cA.weekendCount + cB.weekendCount - meanWeekend,
          ) -
            sq(la.weekendCount - meanWeekend) +
            sq(
              lb.weekendCount - cB.weekendCount + cA.weekendCount - meanWeekend,
            ) -
            sq(lb.weekendCount - meanWeekend));
      // Cheap delta gate before the expensive eligibility check: only a pair that would beat the
      // current best (eligible) delta is worth the rule-engine evaluation. Equivalent to the
      // filter-then-argmin order because an ineligible pair never lowers bestDelta.
      if (
        delta < bestDelta &&
        elig(a.employeeId, slotB) &&
        elig(b.employeeId, slotA)
      ) {
        bestDelta = delta;
        best = {
          slotIdA: a.slotId,
          slotIdB: b.slotId,
          employeeA: a.employeeId,
          employeeB: b.employeeId,
        };
      }
    }
  }
  return best;
}
