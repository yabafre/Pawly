/**
 * Pure CP-SAT model builder — Story 12-1 (KON-129).
 *
 * Builds a NEUTRAL intermediate representation (IR) of the monthly assignment
 * problem: boolean vars per eligible (employee, slot-position), weighted linear
 * <= constraints, and a lexicographic linear objective (fill >> equity spread).
 * The IR is package-agnostic on purpose: only solver-engine.service.ts knows
 * or-tools-wasm, so a solver swap (e.g. Python microservice) never touches this
 * file or its tests. Same purity discipline as rule-engine.ts / local-repair.ts:
 * no NestJS, no Prisma, no I/O, no RNG, deterministic iteration order.
 *
 * Model relaxations (documented, AC6): the 35h-weekly-rest statutory rule is NOT
 * modeled (its necessary condition — at most 6 worked days in any 7-day window —
 * is); the exact check runs at re-validation in the service, which rejects and
 * falls back. The greedy ROTATION_EQUITY relaxation fallback is not modeled
 * either: the solver leaves such slots empty, and the strictly-better acceptance
 * gate keeps the greedy result whenever relaxation filled more positions.
 *
 * Equity in the objective is a LINEARIZED proxy (per-metric max-min spread,
 * weighted by the KON-128 EquityWeights); the exact quadratic normalized
 * objective is only used by the service's acceptance gate via equityObjective().
 */
import type { EquityWeights, EmployeeLoad } from './local-repair';
import {
  intervalsOverlap,
  toAbsoluteInterval,
  type AbsoluteInterval,
} from './shift-interval';

export interface SolverEmployee {
  id: string;
  jobType: string;
  weeklyCapMinutes: number;
  monthlyCapMinutes: number | null;
}

export interface SolverSlot {
  id: string; // deterministic, unique per single-capacity position
  date: string; // 'YYYY-MM-DD'
  shiftTypeCode: string;
  startTime: string; // 'HH:MM'
  endTime: string;
  breakMinutes: number;
  requiredStaff: number;
  requiredJobTypes?: string[];
}

export interface SolverRotationRule {
  targetIsoDay: number; // 1..7 (ISO, Mon..Sun)
  maxPerPeriod: number;
  /** Rule applies only to these job types (absent = all employees) — mirrors ROTATION_EQUITY config. */
  applicableJobTypes?: string[];
}

export interface SolverInput {
  employees: SolverEmployee[];
  slots: SolverSlot[];
  /** employeeId -> Set<'YYYY-MM-DD'> (vacation, sick, school, other). */
  unavailable: Map<string, Set<string>>;
  /** `${employeeId}|${isoWeekMonday}` -> fixed net minutes (border + survivors + school). */
  fixedWeeklyMinutes: Map<string, number>;
  /** employeeId -> fixed net minutes already worked THIS month (survivors) — deducted from the monthly cap, the exact mirror of fixedWeeklyMinutes (Story 13-5, T5). */
  fixedMonthlyMinutes: Map<string, number>;
  /** employeeId -> survivor equity load (saturday/weekend/shift counts) — the per-metric spread baseline, so the spread reflects TOTAL fairness the survivor-aware gate judges (Story 13-5, T7). */
  fixedEquityLoads: Map<string, EmployeeLoad>;
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
  /** varName may be an assignment var, or a `day:{emp}:{date}` pseudo-var the adapter materializes. */
  terms: Array<{ varName: string; coeff: number }>;
  bound: number;
}

export interface IrSpread {
  /** target var (named by `tag`) == max(counts) - min(counts) over per-employee sums. */
  kind: 'spread';
  tag: string;
  perEmployee: Array<{
    employeeId: string;
    terms: Array<{ varName: string; coeff: number }>;
    fixed: number;
  }>;
}

export type IrConstraint = IrLinearLe | IrSpread;

export interface IrObjectiveTerm {
  /** 'fill' for assignment vars (positive weight); a spread tag for spread vars (negative weight). */
  tag: string;
  varName: string;
  weight: number;
}

export interface SolverModel {
  vars: IrVar[];
  constraints: IrConstraint[];
  objective: IrObjectiveTerm[];
}

/** Mirrors FRENCH_LABOR_LAW (french-labor-law.ts) — restated here to keep this module dependency-light. */
const STATUTORY_DAILY_MINUTES = 720; // 12h conventional cap (KON-139; was the L.3121-18 10h default)
// 13h discontinuous-day cap. The per-regime CCN continuous-day amplitude (12h corps / 15h
// practitioners, KON-139) is NOT modeled — the replay re-validation rejects any breach, and
// under-modeling amplitude only risks a fallback, never an invalid served plan.
const STATUTORY_AMPLITUDE_MINUTES = 780; // 13h
const MAX_CONSECUTIVE_DAYS = 6; // L.3132-1

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function netMinutes(s: SolverSlot): number {
  const raw = toMin(s.endTime) - toMin(s.startTime);
  // Overnight wrap only when end is strictly before start; end === start is a
  // zero-length slot (0), matching calculateShiftMinutes in the service so the
  // model coeffs and the fixed baseline share one minutes convention (KON-129).
  const span = raw < 0 ? raw + 1440 : raw;
  return Math.max(0, span - s.breakMinutes);
}

/** ISO weekday 1..7 (Mon..Sun), UTC — matches isoDayOf in the service. */
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

function overlaps(a: AbsoluteInterval, b: AbsoluteInterval): boolean {
  return intervalsOverlap(a, b);
}

/**
 * Statutory 13h amplitude for one calendar day: first start -> last end, breaks
 * included. Stays same-date on purpose — amplitude is a per-day limit (see
 * french-labor-law.ts dayAmplitudeMinutes); the inter-day gap is the 11h daily
 * rest, which story 13-4 owns. Story 13-3 only fixes the span arithmetic: with a
 * midnight-crossing slot the raw HH:MM span was computed as 8h instead of 24h.
 */
function amplitudeExceeded(
  a: SolverSlot,
  b: SolverSlot,
  ia: AbsoluteInterval,
  ib: AbsoluteInterval,
): boolean {
  if (a.date !== b.date) return false;
  const span = Math.max(ia[1], ib[1]) - Math.min(ia[0], ib[0]);
  return span > STATUTORY_AMPLITUDE_MINUTES;
}

function varName(employeeId: string, slotId: string): string {
  return `${employeeId}@${slotId}`;
}

export function buildSolverModel(input: SolverInput): SolverModel {
  const employees = [...input.employees].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const slots = [...input.slots].sort((a, b) => a.id.localeCompare(b.id));

  const vars: IrVar[] = [];
  const varsByEmployee = new Map<string, IrVar[]>();
  const varsBySlot = new Map<string, IrVar[]>();
  for (const e of employees) {
    for (const s of slots) {
      if (input.unavailable.get(e.id)?.has(s.date)) continue;
      if (s.requiredJobTypes?.length && !s.requiredJobTypes.includes(e.jobType))
        continue;
      const v: IrVar = {
        name: varName(e.id, s.id),
        employeeId: e.id,
        slotId: s.id,
      };
      vars.push(v);
      if (!varsByEmployee.has(e.id)) varsByEmployee.set(e.id, []);
      varsByEmployee.get(e.id)!.push(v);
      if (!varsBySlot.has(s.id)) varsBySlot.set(s.id, []);
      varsBySlot.get(s.id)!.push(v);
    }
  }

  const constraints: IrConstraint[] = [];
  const slotById = new Map(slots.map((s) => [s.id, s]));

  // Story 13-3 (KON-132) — one absolute interval per slot, computed once. The
  // pairwise mutex loop below is O(slots^2) per employee; date parsing inside it
  // would be a NFR2 regression.
  const intervalBySlotId = new Map<string, AbsoluteInterval>(
    slots.map((s) => [s.id, toAbsoluteInterval(s)]),
  );

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
        const iA = intervalBySlotId.get(A.s.id)!;
        const iB = intervalBySlotId.get(B.s.id)!;
        if (overlaps(iA, iB)) {
          constraints.push({
            kind: 'linearLe',
            tag: `overlap:${e.id}:${A.s.id}:${B.s.id}`,
            terms: [
              { varName: A.v.name, coeff: 1 },
              { varName: B.v.name, coeff: 1 },
            ],
            bound: 1,
          });
        } else if (amplitudeExceeded(A.s, B.s, iA, iB)) {
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
      if (!byWeek.has(wk)) byWeek.set(wk, []);
      byWeek.get(wk)!.push({ v, minutes: netMinutes(s) });
    }
    for (const [wk, entries] of [...byWeek.entries()].sort((x, y) =>
      x[0].localeCompare(y[0]),
    )) {
      const fixed = input.fixedWeeklyMinutes.get(`${e.id}|${wk}`) ?? 0;
      constraints.push({
        kind: 'linearLe',
        tag: `weekly:${e.id}:${wk}`,
        terms: entries.map((x) => ({ varName: x.v.name, coeff: x.minutes })),
        bound: Math.max(0, e.weeklyCapMinutes - fixed),
      });
    }

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

    // Statutory daily 10h net (fixed daily minutes deducted).
    const byDate = new Map<string, Array<{ v: IrVar; minutes: number }>>();
    for (const { v, s } of evSlots) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date)!.push({ v, minutes: netMinutes(s) });
    }
    for (const [date, entries] of [...byDate.entries()].sort((x, y) =>
      x[0].localeCompare(y[0]),
    )) {
      const fixed = input.fixedDailyMinutes.get(`${e.id}|${date}`) ?? 0;
      constraints.push({
        kind: 'linearLe',
        tag: `statutory-daily:${e.id}:${date}`,
        terms: entries.map((x) => ({ varName: x.v.name, coeff: x.minutes })),
        bound: Math.max(0, STATUTORY_DAILY_MINUTES - fixed),
      });
    }

    // <= 6 consecutive worked days: for every 7-day window with more than 6
    // candidate worked days, sum of per-date day-worked indicators <= 6 minus the
    // days already fixed-worked in the window. `day:{emp}:{date}` are pseudo-vars
    // the adapter materializes as OR over that (employee, date)'s assignment vars.
    // This also encodes the necessary condition of the 35h weekly rest (one full
    // off day per rolling week); the exact 35h check runs at re-validation.
    const fixedWorked = input.fixedWorkedDates.get(e.id) ?? new Set<string>();
    const candidateDates = [
      ...new Set([...byDate.keys(), ...fixedWorked]),
    ].sort();
    for (const start of candidateDates) {
      const window: string[] = [];
      for (let k = 0; k < 7; k++) window.push(addDays(start, k));
      const inWindow = window.filter(
        (d) => byDate.has(d) || fixedWorked.has(d),
      );
      if (inWindow.length <= MAX_CONSECUTIVE_DAYS) continue;
      const fixedCount = window.filter((d) => fixedWorked.has(d)).length;
      constraints.push({
        kind: 'linearLe',
        tag: `consecutive:${e.id}:${start}`,
        // A fixed-worked date already counts toward fixedCount (it lowers the
        // bound), so it must NOT also appear as a free day-var term — otherwise
        // the same day is double-counted. Clamp the bound at 0: an already-illegal
        // baseline (>6 fixed days in a window) yields an infeasible model, and the
        // improve pass safely falls back to greedy rather than emitting a negative
        // bound the adapter would translate into an always-UNSAT constraint.
        terms: window
          .filter((d) => byDate.has(d) && !fixedWorked.has(d))
          .map((d) => ({ varName: `day:${e.id}:${d}`, coeff: 1 })),
        bound: Math.max(0, MAX_CONSECUTIVE_DAYS - fixedCount),
      });
    }

    // HARD rotation caps with history offset.
    for (const rule of input.rotationRules) {
      if (
        rule.applicableJobTypes?.length &&
        !rule.applicableJobTypes.includes(e.jobType)
      )
        continue;
      const targetVars = evSlots.filter(
        ({ s }) => isoWeekday(s.date) === rule.targetIsoDay,
      );
      if (targetVars.length === 0) continue;
      const fixed =
        input.fixedRotationCounts.get(`${e.id}|${rule.targetIsoDay}`) ?? 0;
      constraints.push({
        kind: 'linearLe',
        tag: `rotation:${e.id}:${rule.targetIsoDay}`,
        terms: targetVars.map(({ v }) => ({ varName: v.name, coeff: 1 })),
        bound: Math.max(0, rule.maxPerPeriod - fixed),
      });
    }
  }

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
