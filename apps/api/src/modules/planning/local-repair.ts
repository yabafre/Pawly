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
 * The service injects the eligibility predicates (built on the SAME evaluateEligibility scoreAndAssign
 * uses) and applies/reverts the moves against its live counters. Additions (backfill, swap) are
 * checked on pre-apply state — sound, since adding a shift only tightens constraints. The ejection
 * MOVER is checked on POST-removal state (isMoverEligibleForHole): a hole exists precisely because no
 * one is eligible on the current state, so a pre-move check would never let a capped mover reach the
 * hole it could fill after leaving its own slot. Removing only relaxes, so this stays sound.
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

/**
 * Injected validity predicate for the ejection MOVER — whether `moverEmployeeId` may take `hole`
 * once it has LEFT `vacated`. The service evaluates it on the post-removal state (its vacated shift
 * discounted from the live counters), because a hole exists precisely because no one is eligible for
 * it on the current state — checking the mover pre-move would falsely reject a mover whose own
 * vacated slot is the only thing over its cap. Sound: leaving a slot only relaxes constraints.
 */
export type MoverEligibility = (
  moverEmployeeId: string,
  hole: RepairSlot,
  vacated: RepairSlot,
) => boolean;

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
 * order; for each candidate mover eligible for the hole ONCE IT HAS LEFT its slot (isMoverEligibleForHole,
 * evaluated on post-removal state), scans employees in deterministic order for a backfill eligible for
 * the vacated slot (excluding the mover). Returns the first such chain, or null. The mover is checked
 * post-removal because a hole exists precisely because no one is eligible on the current state — a
 * pre-move check would never let a capped mover reach its own hole. The backfill is an addition, so
 * its pre-apply eligibility is already sound.
 */
export function findEjectionChain(
  hole: RepairSlot,
  assignments: RepairAssignment[],
  slotById: Map<string, RepairSlot>,
  employees: string[],
  isEligible: IsEligible,
  isMoverEligibleForHole: MoverEligibility,
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

  for (const mover of sortedAssignments) {
    if (mover.slotId === hole.id) continue; // already on the hole slot
    const vacated = slotById.get(mover.slotId);
    if (!vacated) continue;
    // Mover must be able to take the hole AFTER leaving `vacated` (post-removal state).
    if (!isMoverEligibleForHole(mover.employeeId, hole, vacated)) continue;
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
    return s
      ? `${s.date}|${s.shiftTypeCode}|${s.startTime}|${a.employeeId}`
      : `${a.slotId}|${a.employeeId}`;
  };
  const sorted = [...assignments].sort((x, y) =>
    keyOf(x).localeCompare(keyOf(y)),
  );

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
      if (
        cA.saturdayCount === cB.saturdayCount &&
        cA.weekendCount === cB.weekendCount
      )
        continue;
      if (!isEligible(a.employeeId, slotB) || !isEligible(b.employeeId, slotA))
        continue;

      const swapped = sorted.map((x) => {
        if (x === a) return { slotId: a.slotId, employeeId: b.employeeId };
        if (x === b) return { slotId: b.slotId, employeeId: a.employeeId };
        return x;
      });
      const obj = equityObjective(computeLoads(swapped, slotById));
      if (obj < bestObj) {
        bestObj = obj;
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
