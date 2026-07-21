/**
 * French labor-law statutory limits — Story 11-3 (KON-120).
 *
 * Single hard-coded source of truth for the four non-disableable statutory limits,
 * enforced across EVERY planning surface (generation eligibility, manual create/move,
 * health-bar validation, publication gate) INDEPENDENTLY of any DB `PlanningRule` —
 * they hold even for a clinic with zero configured rules.
 *
 * Legal refs:
 *  - L.3121-18 : 10h maximum daily working time            -> MAX_DAILY_WORK_MINUTES
 *  - L.3121-16 : 20-min break once > 6h worked in a day     -> MIN_BREAK_MINUTES_OVER_6H
 *  - L.3121-20 : 48h absolute weekly ceiling (net worked)   -> MAX_WEEKLY_WORK_MINUTES
 *  - L.3131-1  : 11h minimum daily rest between work blocks -> MIN_DAILY_REST_MINUTES
 *  - L.3132-2  : 35h minimum consecutive weekly rest        -> MIN_WEEKLY_REST_HOURS
 *  - L.3132-1  : one rest day per 7 (max 6 worked in a row) -> MAX_CONSECUTIVE_WORK_DAYS
 *
 * 13h amplitude (MAX_DAILY_AMPLITUDE_MINUTES) is a SAME-DAY span cap; Story 13-4 adds the
 * 11h BETWEEN-block daily rest (L.3131-1) that 11-3 had used amplitude as a proxy for.
 *
 * Times are `HH:MM` 24h strings; dates are `YYYY-MM-DD` calendar days interpreted in UTC
 * (matches the generation service's getWeekBounds / getPreviousDate conventions). Overnight
 * shifts (endTime < startTime) wrap past midnight; endTime === startTime is a zero-length
 * slot. See shift-interval.ts for the shared primitive.
 */

import { toAbsoluteInterval } from './shift-interval';

/**
 * CCN regimes — KON-139. The extended veterinary collective agreement carries two distinct
 * working-time regimes under one roof since the merger accord of 2019-03-29:
 * corps IDCC 1875 (non-veterinarian staff) and annexe VII ex-IDCC 2564 (salaried
 * practitioners, i.e. employees under the veterinary order's authority). Regime is derived
 * from `Employee.jobType` — VET is the only ordinal job type in the schema.
 * Legal basis: docs/reference/ccn-veterinary-worktime-verification.md (owner-approved).
 */
export type StatutoryRegime = 'SUPPORT_STAFF' | 'PRACTITIONER';

export function regimeForJobType(
  jobType: string | null | undefined,
): StatutoryRegime {
  return jobType === 'VET' ? 'PRACTITIONER' : 'SUPPORT_STAFF';
}

/** Per-regime CCN limits that differ between corps 1875 and annexe VII. */
export const CCN_LIMITS = {
  SUPPORT_STAFF: {
    /** CCN art. 18 — continuous-day duration AND amplitude both capped at 12h. */
    CONTINUOUS_DAY_AMPLITUDE_MINUTES: 720,
    /** Art. 18 — the 2 consecutive rest days of the 4-per-fortnight rule MUST include a Sunday. */
    SUNDAY_IN_REST_PAIR_HARD: true,
  },
  PRACTITIONER: {
    /** Annexe VII art. 20 — continuous-day amplitude may be raised to 15h. */
    CONTINUOUS_DAY_AMPLITUDE_MINUTES: 900,
    /** Annexe VII art. 20 — « de préférence un dimanche » → SOFT preference, not blocking. */
    SUNDAY_IN_REST_PAIR_HARD: false,
  },
} as const satisfies Record<
  StatutoryRegime,
  {
    CONTINUOUS_DAY_AMPLITUDE_MINUTES: number;
    SUNDAY_IN_REST_PAIR_HARD: boolean;
  }
>;

/** CCN limits shared by both regimes (on top of the Code set below). */
export const CCN_SHARED = {
  /** Art. 18 / annexe VII art. 20 — max 2 disjoint work blocks (vacations) per day. */
  MAX_VACATIONS_PER_DAY: 2,
  /** Art. 18 — with 2 vacations, the shorter must be >= 2h and the longer >= 3h (gross). */
  VACATION_MIN_SHORT_MINUTES: 120,
  VACATION_MIN_LONG_MINUTES: 180,
  /** Art. 18 — trigger: a continuous worked day of >= 10h net. */
  CONTINUOUS_TRIGGER_NET_MINUTES: 600,
  /** Art. 18 — every 14-day window containing a trigger day needs >= 4 rest days... */
  REST_WINDOW_DAYS: 14,
  REST_MIN_DAYS_IN_WINDOW: 4,
  /** ...of which >= 2 consecutive (Sunday membership per regime above). */
  REST_MIN_CONSECUTIVE_DAYS: 2,
  /** Art. 18 / annexe VII art. 20 — 44h average ceiling over 12 consecutive ISO weeks. */
  TWELVE_WEEK_SPAN: 12,
  MAX_TWELVE_WEEK_TOTAL_MINUTES: 12 * 44 * 60, // 31 680
} as const;

/**
 * Radius (real days) of the statutory data window every incremental caller loads around a
 * candidate. KON-139 widened it from 8 to 14: the CCN rest-days rule must fully prove any
 * 14-day window containing the candidate ([c-13,c] .. [c,c+13] ⊆ [c-14,c+14]).
 */
export const STATUTORY_WINDOW_DAYS = 14;

/** Options for `wouldExceedStatutory` — KON-139. */
export type WouldExceedOptions = {
  regime: StatutoryRegime;
  /**
   * 12-week-average support: `totals(isoMonday)` returns the employee's net worked minutes
   * for that ISO week EXCLUDING the candidate (live counters + history), and
   * `lastWeekMonday` is the last ISO week with known data (windows reaching past it are
   * skipped — they are re-checked when those weeks gain their own assignments). Omit to
   * skip the 44h/12-week check.
   */
  twelveWeek?: {
    totals: (isoMonday: string) => number;
    lastWeekMonday: string;
  };
};

export const FRENCH_LABOR_LAW = {
  /**
   * Max net worked per employee per calendar day. 12h by express conventional derogation
   * (CCN art. 18 corps / annexe VII art. 20 — L.3121-19 path), KON-139; was the L.3121-18
   * 10h default until then. Both regimes.
   */
  MAX_DAILY_WORK_MINUTES: 720,
  /** 13h max amplitude for a DISCONTINUOUS day (>= 2 vacations); continuous days use CCN_LIMITS. */
  MAX_DAILY_AMPLITUDE_MINUTES: 780,
  /** L.3131-1 — >= 11h rest between two consecutive worked blocks (merged busy intervals). */
  MIN_DAILY_REST_MINUTES: 660,
  /** L.3121-20 — absolute 48h net worked per ISO week; wins over any configured cap. */
  MAX_WEEKLY_WORK_MINUTES: 2880,
  /** L.3121-16 — a 20-min break is mandatory once net worked exceeds 6h in a day. */
  MIN_BREAK_MINUTES_OVER_6H: 20,
  /** Net-worked threshold (minutes) above which MIN_BREAK_MINUTES_OVER_6H applies. */
  BREAK_REQUIRED_AFTER_MINUTES: 360,
  /** L.3132-2 — >= 35h continuous rest per ISO week. */
  MIN_WEEKLY_REST_HOURS: 35,
  /** L.3132-1 — <= 6 consecutive worked calendar days. */
  MAX_CONSECUTIVE_WORK_DAYS: 6,
} as const;

/** Name + config of the visible statutory rule seeded at onboarding (Task 7). */
export const STATUTORY_RULE_NAME = 'French labor-law limits';
export const STATUTORY_RULE_CONFIG = {
  maxDailyHours: FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES / 60,
  maxDailyAmplitudeHours: FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES / 60,
  minDailyRestHours: FRENCH_LABOR_LAW.MIN_DAILY_REST_MINUTES / 60,
  maxWeeklyStatutoryHours: FRENCH_LABOR_LAW.MAX_WEEKLY_WORK_MINUTES / 60,
  minBreakMinutesOver6h: FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H,
  minWeeklyRestHours: FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS,
  maxConsecutiveWorkDays: FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS,
} as const;

export type StatutoryViolationKind =
  | 'DAILY_WORK'
  | 'DAILY_AMPLITUDE'
  | 'DAILY_REST'
  | 'WEEKLY_CEILING'
  | 'MANDATORY_BREAK'
  | 'WEEKLY_REST'
  | 'CONSECUTIVE_DAYS'
  // KON-139 — CCN working-time rules (both regimes unless noted):
  | 'VACATIONS_COUNT' // > 2 disjoint work blocks in one day
  | 'VACATION_MIN_DURATION' // 2 blocks but shorter < 2h or longer < 3h (gross)
  | 'REST_DAYS_WINDOW' // a 14-day window w/ >=10h continuous day lacks 4 rest days / 2 consecutive (/ Sunday, corps)
  | 'REST_DAYS_SUNDAY' // SOFT (practitioners) — pair exists but contains no Sunday
  | 'TWELVE_WEEK_AVG'; // > 44h average over 12 consecutive ISO weeks

/** Minimal shift shape the statutory checks need. `date` = `YYYY-MM-DD`, times = `HH:MM`. */
export type StatutoryShift = {
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
};

export type StatutoryViolation = {
  kind: StatutoryViolationKind;
  /** Day the breach is attributed to (DAILY_*, CONSECUTIVE_DAYS, VACATIONS_*, REST_DAYS_* = offending/trigger day; WEEKLY_REST, WEEKLY_CEILING, TWELVE_WEEK_AVG = ISO-week Monday). */
  date: string;
  /** Measured value: minutes for DAILY_x, VACATION_MIN_DURATION and TWELVE_WEEK_AVG; hours for WEEKLY_REST; days/counts otherwise. */
  actual: number;
  /** The statutory limit that was exceeded, in the same unit as `actual`. */
  limit: number;
  /** KON-139 — true only for REST_DAYS_SUNDAY on the PRACTITIONER regime (« de préférence »): surfaced as a warning, never blocking. */
  soft?: boolean;
};

/** Options every statutory evaluation now requires — KON-139 makes regime explicit at every call-site (compile-enforced). */
export type StatutoryOptions = {
  regime: StatutoryRegime;
  /** ISO bounds of the loaded data window (weekly-rest sentinel clip + rest-days-window coverage). */
  window?: { start: string; end: string };
  /**
   * Net worked minutes per ISO-week Monday for weeks NOT represented in the shift set
   * (typically the 11 weeks preceding the loaded window). Missing week = 0 (unknown
   * pre-Pawly history is treated as rest — documented in the quick-spec).
   */
  weeklyHistory?: ReadonlyMap<string, number>;
};

const MIN_PER_DAY = 1440;
const EPOCH = '1970-01-01';
const BIG = 10 ** 9;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function dayDiff(aStr: string, bStr: string): number {
  const a = Date.parse(`${aStr}T00:00:00.000Z`);
  const b = Date.parse(`${bStr}T00:00:00.000Z`);
  return Math.round((a - b) / 86_400_000);
}

function shiftEpoch(dateStr: string): number {
  return dayDiff(dateStr, EPOCH) * MIN_PER_DAY;
}

function epochMinuteToDate(absMinutes: number): string {
  return addDays(EPOCH, Math.floor(absMinutes / MIN_PER_DAY));
}

function addDays(dateStr: string, delta: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().split('T')[0];
}

export function isoWeekStart(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const dow = date.getUTCDay(); // 0=Sun, 1=Mon...
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().split('T')[0];
}

/** Net worked minutes of one shift (break deducted; overnight wrap). */
export function shiftNetMinutes(shift: StatutoryShift): number {
  const start = toMinutes(shift.startTime);
  const end = toMinutes(shift.endTime);
  const gross = end >= start ? end - start : MIN_PER_DAY - start + end;
  return gross - (shift.breakMinutes ?? 0);
}

/** Total net worked minutes across a single day's shifts. */
export function dayWorkedMinutes(dayShifts: StatutoryShift[]): number {
  return dayShifts.reduce((sum, s) => sum + shiftNetMinutes(s), 0);
}

/** Amplitude in minutes for a single day: earliest start -> latest end (breaks included). */
export function dayAmplitudeMinutes(dayShifts: StatutoryShift[]): number {
  if (dayShifts.length === 0) return 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const s of dayShifts) {
    const start = toMinutes(s.startTime);
    const end = toMinutes(s.endTime);
    const wrappedEnd = end >= start ? end : end + MIN_PER_DAY;
    if (start < minStart) minStart = start;
    if (wrappedEnd > maxEnd) maxEnd = wrappedEnd;
  }
  return maxEnd - minStart;
}

/** Longest run of consecutive worked calendar days present in the set (dates may repeat). */
export function maxConsecutiveWorkedDays(workedDates: string[]): number {
  const days = [...new Set(workedDates)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev !== null && dayDiff(d, prev) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/** Absolute busy intervals (minutes since EPOCH), merged & sorted. */
function mergedBusyIntervals(
  shifts: StatutoryShift[],
): Array<[number, number]> {
  // Story 13-3 — the (date, HH:MM) -> absolute minutes mapping now lives in
  // shift-interval.ts so the engine, the solver IR and this module cannot drift
  // on what "overnight" means.
  const intervals = shifts.map(
    (s) => toAbsoluteInterval(s) as [number, number],
  );
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of intervals) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/** Rest gaps (absolute minutes) = complement of merged busy time, with unbounded lead/trail. */
function restGaps(shifts: StatutoryShift[]): Array<[number, number]> {
  const busy = mergedBusyIntervals(shifts);
  if (busy.length === 0) return [[-BIG, BIG]];
  const gaps: Array<[number, number]> = [[-BIG, busy[0][0]]];
  for (let i = 0; i < busy.length - 1; i++)
    gaps.push([busy[i][1], busy[i + 1][0]]);
  gaps.push([busy[busy.length - 1][1], BIG]);
  return gaps;
}

/** Length of the consecutive-worked-day run that passes through `date` in `workedDates`. */
function runLengthThrough(workedDates: Set<string>, date: string): number {
  let len = 1;
  let d = date;
  for (;;) {
    const p = addDays(d, -1);
    if (!workedDates.has(p)) break;
    len++;
    d = p;
  }
  d = date;
  for (;;) {
    const n = addDays(d, 1);
    if (!workedDates.has(n)) break;
    len++;
    d = n;
  }
  return len;
}

/** True when the day's shifts collapse to a single merged busy block (« journée continue »). */
function isContinuousDay(dayShifts: StatutoryShift[]): boolean {
  return mergedBusyIntervals(dayShifts).length === 1;
}

/** Amplitude limit for one day: continuous days use the per-regime CCN cap, discontinuous days keep 13h. */
function amplitudeLimitMinutes(
  regime: StatutoryRegime,
  dayShifts: StatutoryShift[],
): number {
  return isContinuousDay(dayShifts)
    ? CCN_LIMITS[regime].CONTINUOUS_DAY_AMPLITUDE_MINUTES
    : FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES;
}

/** KON-139 — CCN vacation-structure violations for ONE day (count + minimum durations, gross block lengths). */
function dayVacationViolations(
  date: string,
  dayShifts: StatutoryShift[],
): StatutoryViolation[] {
  const blocks = mergedBusyIntervals(dayShifts);
  if (blocks.length > CCN_SHARED.MAX_VACATIONS_PER_DAY) {
    return [
      {
        kind: 'VACATIONS_COUNT',
        date,
        actual: blocks.length,
        limit: CCN_SHARED.MAX_VACATIONS_PER_DAY,
      },
    ];
  }
  if (blocks.length === 2) {
    const durations = blocks.map(([s, e]) => e - s).sort((a, b) => a - b);
    const out: StatutoryViolation[] = [];
    if (durations[0] < CCN_SHARED.VACATION_MIN_SHORT_MINUTES) {
      out.push({
        kind: 'VACATION_MIN_DURATION',
        date,
        actual: durations[0],
        limit: CCN_SHARED.VACATION_MIN_SHORT_MINUTES,
      });
    } else if (durations[1] < CCN_SHARED.VACATION_MIN_LONG_MINUTES) {
      out.push({
        kind: 'VACATION_MIN_DURATION',
        date,
        actual: durations[1],
        limit: CCN_SHARED.VACATION_MIN_LONG_MINUTES,
      });
    }
    return out;
  }
  return [];
}

function isSunday(dateStr: string): boolean {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay() === 0;
}

/**
 * KON-139 — CCN rest-days rule (art. 18 / annexe VII art. 20): every fully-covered 14-day
 * window containing a trigger day (continuous worked day >= 10h net) must hold >= 4 rest
 * days, of which >= 2 consecutive — including a Sunday (HARD on corps 1875, SOFT preference
 * on annexe VII). Returns the trigger days whose windows fail (deduped per trigger day).
 */
function restDaysWindowFindings(
  workedDates: Set<string>,
  triggerDays: Iterable<string>,
  coverage: { start: string; end: string },
  sundayHard: boolean,
): { hard: Map<string, number>; soft: Set<string> } {
  const hard = new Map<string, number>(); // trigger day -> rest-day count of the first failing window
  const soft = new Set<string>();
  for (const t of triggerDays) {
    let softCandidate = false;
    for (let back = CCN_SHARED.REST_WINDOW_DAYS - 1; back >= 0; back--) {
      const ws = addDays(t, -back);
      const we = addDays(ws, CCN_SHARED.REST_WINDOW_DAYS - 1);
      if (ws < coverage.start || we > coverage.end) continue; // window not fully proven by loaded data
      const restDates: string[] = [];
      for (let i = 0; i < CCN_SHARED.REST_WINDOW_DAYS; i++) {
        const d = addDays(ws, i);
        if (!workedDates.has(d)) restDates.push(d);
      }
      let hasPair = false;
      let hasSundayPair = false;
      for (let i = 0; i < restDates.length - 1; i++) {
        if (dayDiff(restDates[i + 1], restDates[i]) === 1) {
          hasPair = true;
          if (isSunday(restDates[i]) || isSunday(restDates[i + 1]))
            hasSundayPair = true;
        }
      }
      const hardFail =
        restDates.length < CCN_SHARED.REST_MIN_DAYS_IN_WINDOW ||
        !hasPair ||
        (sundayHard && !hasSundayPair);
      if (hardFail) {
        if (!hard.has(t)) hard.set(t, restDates.length);
        break; // one failing window is enough to flag the trigger day
      }
      if (!sundayHard && !hasSundayPair) softCandidate = true;
    }
    if (!hard.has(t) && softCandidate) soft.add(t);
  }
  return { hard, soft };
}

/**
 * KON-139 — 44h average over 12 consecutive ISO weeks (art. 18 / annexe VII art. 20),
 * post-hoc: one violation per shift-bearing week whose trailing 12-week total exceeds the
 * cap. `weeklyHistory` supplies weeks not represented in `shifts` (missing week = 0 —
 * unknown pre-Pawly history counts as rest, documented in the quick-spec).
 */
function twelveWeekViolations(
  shifts: StatutoryShift[],
  weeklyHistory?: ReadonlyMap<string, number>,
): StatutoryViolation[] {
  // History is AUTHORITATIVE for its weeks: a week present in `weeklyHistory` ignores any
  // shift rows the (possibly partial) loaded window contributes to it — no double count,
  // and edge weeks half-covered by a +/-14-day load stay fully summed.
  const totals = new Map<string, number>(weeklyHistory ?? []);
  const shiftWeeks = new Set<string>();
  for (const s of shifts) {
    const wk = isoWeekStart(s.date);
    if (weeklyHistory?.has(wk)) continue;
    shiftWeeks.add(wk);
    totals.set(wk, (totals.get(wk) ?? 0) + shiftNetMinutes(s));
  }
  const out: StatutoryViolation[] = [];
  for (const wkEnd of [...shiftWeeks].sort()) {
    let sum = 0;
    for (let i = 0; i < CCN_SHARED.TWELVE_WEEK_SPAN; i++)
      sum += totals.get(addDays(wkEnd, -7 * i)) ?? 0;
    if (sum > CCN_SHARED.MAX_TWELVE_WEEK_TOTAL_MINUTES) {
      out.push({
        kind: 'TWELVE_WEEK_AVG',
        date: wkEnd,
        actual: sum,
        limit: CCN_SHARED.MAX_TWELVE_WEEK_TOTAL_MINUTES,
      });
    }
  }
  return out;
}

/**
 * Length of a rest gap that counts toward the week [lo, hi). A gap bounded by real
 * shifts on both sides is credited in FULL. An OPEN end — the -BIG lead / +BIG trail
 * sentinel from restGaps (no shift loaded before the first / after the last in the
 * provided set) — is clipped to the REAL data-window edge `win` when the caller loaded
 * one, NOT to the ISO-week boundary [lo, hi].
 *
 * Story 13-2 (KON-134): clipping a sentinel to the week credited "phantom" rest the
 * window never proved — a Sat-evening→Mon-morning gap looked like 35h only because the
 * offending prior shift sat outside the strict-month set (audit T4). Clipping to the
 * loaded +/-8-real-day window instead means a genuinely >=35h rest is still credited
 * (the window spans >35h each side) while unknown rest beyond the window is not, so a
 * month-frontier deficit surfaces. `win` bounds are absolute minutes since EPOCH.
 */
function clampGapLen(
  gs: number,
  ge: number,
  lo: number,
  hi: number,
  win?: { lo: number; hi: number },
): number {
  const loEdge = win ? win.lo : lo;
  const hiEdge = win ? win.hi : hi;
  const start = gs <= -BIG ? loEdge : gs;
  const end = ge >= BIG ? hiEdge : ge;
  return end - start;
}

/** True if the ISO week starting `weekStart` has NO >=35h rest gap overlapping it.
 *  `allShifts` may span beyond the week — neighbours are needed for boundary straddle.
 *  Story 13-2 — `win` (absolute-minute data-window bounds) clips open-ended sentinels to
 *  the real loaded window instead of the ISO week, killing phantom rest at a frontier. */
function weekHasRestDeficit(
  allShifts: StatutoryShift[],
  weekStart: string,
  win?: { lo: number; hi: number },
): boolean {
  const worked = allShifts.some((s) => isoWeekStart(s.date) === weekStart);
  if (!worked) return false;
  const lo = shiftEpoch(weekStart);
  const hi = lo + 7 * MIN_PER_DAY;
  const restMin = FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS * 60;
  const overlapping = restGaps(allShifts).filter(
    ([gs, ge]) => gs < hi && ge > lo,
  );
  return !overlapping.some(
    ([gs, ge]) => clampGapLen(gs, ge, lo, hi, win) >= restMin,
  );
}

/**
 * POST-HOC scan — every statutory breach in one employee's shift set.
 * `shifts` MUST all belong to the same employee. Pure.
 * Story 13-2 (KON-134): pass `window` (the ISO `YYYY-MM-DD` bounds of the loaded data
 * window, e.g. the +/-8-real-day publish window) so weekly-rest credit is bounded to what
 * the window proves, not to the ISO-week edge. Omit it to keep the legacy week-clip.
 */
export function findStatutoryViolations(
  shifts: StatutoryShift[],
  opts: StatutoryOptions,
): StatutoryViolation[] {
  const out: StatutoryViolation[] = [];
  const { window, regime } = opts;
  const win = window
    ? {
        lo: shiftEpoch(window.start),
        hi: shiftEpoch(window.end) + MIN_PER_DAY,
      }
    : undefined;

  const byDay = new Map<string, StatutoryShift[]>();
  for (const s of shifts) {
    const arr = byDay.get(s.date) ?? [];
    arr.push(s);
    byDay.set(s.date, arr);
  }

  for (const [date, dayShifts] of byDay) {
    const worked = dayWorkedMinutes(dayShifts);
    if (worked > FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES) {
      out.push({
        kind: 'DAILY_WORK',
        date,
        actual: worked,
        limit: FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES,
      });
    }
    const amplitude = dayAmplitudeMinutes(dayShifts);
    const ampLimit = amplitudeLimitMinutes(regime, dayShifts);
    if (amplitude > ampLimit) {
      out.push({
        kind: 'DAILY_AMPLITUDE',
        date,
        actual: amplitude,
        limit: ampLimit,
      });
    }
    out.push(...dayVacationViolations(date, dayShifts));
    const totalBreak = dayShifts.reduce(
      (sum, s) => sum + (s.breakMinutes ?? 0),
      0,
    );
    if (
      worked > FRENCH_LABOR_LAW.BREAK_REQUIRED_AFTER_MINUTES &&
      totalBreak < FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H
    ) {
      out.push({
        kind: 'MANDATORY_BREAK',
        date,
        actual: totalBreak,
        limit: FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H,
      });
    }
  }

  // Consecutive days — EVERY worked day beyond the max is itself a breach (the 7th, 8th, …),
  // each attributed to its own day.
  // Story 13-2 (KON-134) aped-review: flag each excess day, not just the first. A run whose
  // 7th day falls in an adjacent month but which continues INTO the reported range would
  // otherwise be attributed solely to that out-of-range first-breach day and then dropped by
  // the publish range filter (PlanningService.violationInPublishedRange) — a HARD statutory
  // block silently bypassed at a month frontier (the exact gap 13-2 exists to close). Per-day
  // attribution also lets the Planning Health Bar highlight the offending in-grid cell
  // (statutoryToHardViolation's affectedDate keys the grid-cell conflict lookup).
  const sortedDays = [...byDay.keys()].sort();
  let run = 0;
  let prev: string | null = null;
  for (const d of sortedDays) {
    run = prev !== null && dayDiff(d, prev) === 1 ? run + 1 : 1;
    if (run > FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS) {
      out.push({
        kind: 'CONSECUTIVE_DAYS',
        date: d,
        actual: run,
        limit: FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS,
      });
    }
    prev = d;
  }

  // Weekly rest — every ISO week with worked shifts must be overlapped by a >=35h rest gap.
  const weeks = new Set(sortedDays.map(isoWeekStart));
  const gaps = restGaps(shifts);
  const restMin = FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS * 60;
  for (const wk of weeks) {
    const lo = shiftEpoch(wk);
    const hi = lo + 7 * MIN_PER_DAY;
    const overlapping = gaps.filter(([gs, ge]) => gs < hi && ge > lo);
    if (
      !overlapping.some(
        ([gs, ge]) => clampGapLen(gs, ge, lo, hi, win) >= restMin,
      )
    ) {
      const best = overlapping.reduce(
        (m, [gs, ge]) => Math.max(m, clampGapLen(gs, ge, lo, hi, win)),
        0,
      );
      out.push({
        kind: 'WEEKLY_REST',
        date: wk,
        actual: Math.floor(best / 60),
        limit: FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS,
      });
    }
  }

  // Daily rest (L.3131-1) — every gap between consecutive merged busy intervals must be
  // >= 11h. A shorter gap (cross-midnight OR intra-day split) is a deficit attributed to
  // the day work RESUMED (the later interval's start). Cross-midnight aware via the merged
  // absolute-minute intervals (Story 13-3's toAbsoluteInterval).
  const busy = mergedBusyIntervals(shifts);
  for (let i = 0; i < busy.length - 1; i++) {
    const gap = busy[i + 1][0] - busy[i][1];
    if (gap < FRENCH_LABOR_LAW.MIN_DAILY_REST_MINUTES) {
      out.push({
        kind: 'DAILY_REST',
        date: epochMinuteToDate(busy[i + 1][0]),
        actual: gap,
        limit: FRENCH_LABOR_LAW.MIN_DAILY_REST_MINUTES,
      });
    }
  }

  // Absolute weekly ceiling (L.3121-20) — net minutes per ISO week must not exceed 48h.
  // Statutory: independent of any configured maxWeeklyHours. Attributed to ISO-week Monday.
  const weekWorked = new Map<string, number>();
  for (const s of shifts) {
    const wk = isoWeekStart(s.date);
    weekWorked.set(wk, (weekWorked.get(wk) ?? 0) + shiftNetMinutes(s));
  }
  for (const [wk, mins] of weekWorked) {
    if (mins > FRENCH_LABOR_LAW.MAX_WEEKLY_WORK_MINUTES) {
      out.push({
        kind: 'WEEKLY_CEILING',
        date: wk,
        actual: mins,
        limit: FRENCH_LABOR_LAW.MAX_WEEKLY_WORK_MINUTES,
      });
    }
  }

  // KON-139 — CCN rest-days rule: 14-day windows around >=10h continuous days. Coverage
  // defaults to the shift set's own span when no explicit data window was provided.
  const workedDates = new Set(sortedDays);
  const triggerDays = sortedDays.filter((d) => {
    const dayShifts = byDay.get(d)!;
    return (
      isContinuousDay(dayShifts) &&
      dayWorkedMinutes(dayShifts) >= CCN_SHARED.CONTINUOUS_TRIGGER_NET_MINUTES
    );
  });
  if (triggerDays.length > 0) {
    const coverage = window ?? {
      start: sortedDays[0],
      end: sortedDays[sortedDays.length - 1],
    };
    const findings = restDaysWindowFindings(
      workedDates,
      triggerDays,
      coverage,
      CCN_LIMITS[regime].SUNDAY_IN_REST_PAIR_HARD,
    );
    for (const [t, restCount] of findings.hard) {
      out.push({
        kind: 'REST_DAYS_WINDOW',
        date: t,
        actual: restCount,
        limit: CCN_SHARED.REST_MIN_DAYS_IN_WINDOW,
      });
    }
    for (const t of findings.soft) {
      out.push({
        kind: 'REST_DAYS_SUNDAY',
        date: t,
        actual: 0,
        limit: 1,
        soft: true,
      });
    }
  }

  // KON-139 — 44h average over 12 consecutive ISO weeks.
  out.push(...twelveWeekViolations(shifts, opts.weeklyHistory));

  return out;
}

/** Count of gaps between consecutive merged busy intervals that are under 11h. */
function countDailyRestDeficits(shifts: StatutoryShift[]): number {
  const busy = mergedBusyIntervals(shifts);
  let count = 0;
  for (let i = 0; i < busy.length - 1; i++) {
    if (busy[i + 1][0] - busy[i][1] < FRENCH_LABOR_LAW.MIN_DAILY_REST_MINUTES)
      count++;
  }
  return count;
}

/** Net worked minutes of the ISO week containing `date`, across `shifts`. */
function weekWorkedMinutes(shifts: StatutoryShift[], date: string): number {
  const wk = isoWeekStart(date);
  return shifts
    .filter((s) => isoWeekStart(s.date) === wk)
    .reduce((sum, s) => sum + shiftNetMinutes(s), 0);
}

/**
 * INCREMENTAL check — which statutory limits adding `candidate` would breach for an
 * employee who already holds `windowShifts` (same employee). Only breaches INTRODUCED by
 * the candidate are returned (a pre-existing breach in `windowShifts` is not re-flagged),
 * so it never blocks an assignment that cannot make things worse. Used to reject a single
 * generation candidate / manual create / manual move before it is written.
 * Story 13-2 (KON-134): the weekly-rest window is candidate.date +/- 8 real days — the
 * exact window every caller loads (createManualShift, loadMoveValidationInputs, generation
 * eligibility) — so a sentinel is clipped to it, not to the ISO week (no phantom rest).
 */
export function wouldExceedStatutory(
  windowShifts: StatutoryShift[],
  candidate: StatutoryShift,
  opts: WouldExceedOptions,
): StatutoryViolationKind[] {
  const kinds: StatutoryViolationKind[] = [];
  const { regime } = opts;
  const withCandidate = [...windowShifts, candidate];
  // KON-139 — the loaded data window is +/-14 real days (was +/-8): the CCN rest-days rule
  // needs every 14-day window containing the candidate to be fully proven.
  const win = {
    lo: shiftEpoch(addDays(candidate.date, -STATUTORY_WINDOW_DAYS)),
    hi:
      shiftEpoch(addDays(candidate.date, STATUTORY_WINDOW_DAYS)) + MIN_PER_DAY,
  };

  // Daily — candidate's day only, introduced-by-candidate
  const dayBefore = windowShifts.filter((s) => s.date === candidate.date);
  const dayAfter = withCandidate.filter((s) => s.date === candidate.date);
  if (
    dayWorkedMinutes(dayAfter) > FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES &&
    dayWorkedMinutes(dayBefore) <= FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES
  ) {
    kinds.push('DAILY_WORK');
  }
  // Amplitude is day-shape aware (KON-139): the candidate can merge blocks into a
  // continuous day (or split one), so before/after are each judged against their OWN limit.
  const ampBreachBefore =
    dayBefore.length > 0 &&
    dayAmplitudeMinutes(dayBefore) > amplitudeLimitMinutes(regime, dayBefore);
  const ampBreachAfter =
    dayAmplitudeMinutes(dayAfter) > amplitudeLimitMinutes(regime, dayAfter);
  if (ampBreachAfter && !ampBreachBefore) {
    kinds.push('DAILY_AMPLITUDE');
  }

  // KON-139 — CCN vacation structure (count + minimum durations), candidate's day only.
  const vacBreachBefore =
    dayBefore.length > 0 &&
    dayVacationViolations(candidate.date, dayBefore).length > 0;
  const vacViolationsAfter = dayVacationViolations(candidate.date, dayAfter);
  if (vacViolationsAfter.length > 0 && !vacBreachBefore) {
    kinds.push(vacViolationsAfter[0].kind);
  }

  // Mandatory break (L.3121-16) — candidate's day: > 6h net worked with < 20min break.
  const breakBefore = dayBefore.reduce((s, x) => s + (x.breakMinutes ?? 0), 0);
  const breakAfter = dayAfter.reduce((s, x) => s + (x.breakMinutes ?? 0), 0);
  const breachAfter =
    dayWorkedMinutes(dayAfter) >
      FRENCH_LABOR_LAW.BREAK_REQUIRED_AFTER_MINUTES &&
    breakAfter < FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H;
  const breachBefore =
    dayWorkedMinutes(dayBefore) >
      FRENCH_LABOR_LAW.BREAK_REQUIRED_AFTER_MINUTES &&
    breakBefore < FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H;
  if (breachAfter && !breachBefore) kinds.push('MANDATORY_BREAK');

  // Consecutive days — only when the candidate adds a NEW worked day
  const datesBefore = new Set(windowShifts.map((s) => s.date));
  if (!datesBefore.has(candidate.date)) {
    const runWith = runLengthThrough(
      new Set(withCandidate.map((s) => s.date)),
      candidate.date,
    );
    if (runWith > FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS)
      kinds.push('CONSECUTIVE_DAYS');
  }

  // Weekly rest — candidate's ISO week, introduced-by-candidate
  const wk = isoWeekStart(candidate.date);
  if (
    weekHasRestDeficit(withCandidate, wk, win) &&
    !weekHasRestDeficit(windowShifts, wk, win)
  ) {
    kinds.push('WEEKLY_REST');
  }

  // Daily rest (L.3131-1) — a NEW deficit gap introduced by the candidate. Count-based, not a
  // whole-window boolean: a pre-existing <11h gap elsewhere in the loaded window (plausible on
  // rollout — this rule post-dates the shift data it retrofits) must not mask a fresh deficit the
  // candidate creates next to itself (aped-review F1). Insertion here is overlap-free (overlaps are
  // rejected upstream), so the deficit count is monotonic under insertion and rises iff the
  // candidate adds a gap < 11h.
  if (
    countDailyRestDeficits(withCandidate) > countDailyRestDeficits(windowShifts)
  )
    kinds.push('DAILY_REST');

  // Absolute weekly ceiling (L.3121-20) — candidate's ISO week net minutes over 48h.
  if (
    weekWorkedMinutes(withCandidate, candidate.date) >
      FRENCH_LABOR_LAW.MAX_WEEKLY_WORK_MINUTES &&
    weekWorkedMinutes(windowShifts, candidate.date) <=
      FRENCH_LABOR_LAW.MAX_WEEKLY_WORK_MINUTES
  ) {
    kinds.push('WEEKLY_CEILING');
  }

  // KON-139 — CCN rest-days rule, introduced-by-candidate: the candidate can create a new
  // >=10h continuous trigger day, or consume a rest day a neighbouring trigger relied on.
  // Count-based (like DAILY_REST): flag iff the number of failing trigger days rises.
  {
    // Perf (NFR2): only the 14 windows CONTAINING candidate.date can differ between the
    // before/after states — every other window sees identical worked days and cancels out
    // of the comparison. Work is therefore bounded to 14 windows x 14 days per call, and
    // the fast path skips even that when no >=10h continuous trigger day sits within 13
    // days of the candidate (the overwhelmingly common 4-8h case).
    const byDayWith = new Map<string, StatutoryShift[]>();
    for (const s of withCandidate) {
      const arr = byDayWith.get(s.date) ?? [];
      arr.push(s);
      byDayWith.set(s.date, arr);
    }
    const isTrigger = (ds: StatutoryShift[] | undefined): boolean =>
      ds !== undefined &&
      dayWorkedMinutes(ds) >= CCN_SHARED.CONTINUOUS_TRIGGER_NET_MINUTES &&
      isContinuousDay(ds);
    let hasTriggerNear = false;
    for (const [d, ds] of byDayWith) {
      if (Math.abs(dayDiff(d, candidate.date)) <= 13 && isTrigger(ds)) {
        hasTriggerNear = true;
        break;
      }
    }
    if (hasTriggerNear) {
      const coverage = {
        start: addDays(candidate.date, -STATUTORY_WINDOW_DAYS),
        end: addDays(candidate.date, STATUTORY_WINDOW_DAYS),
      };
      const sundayHard = CCN_LIMITS[regime].SUNDAY_IN_REST_PAIR_HARD;
      const byDayBefore = new Map<string, StatutoryShift[]>();
      for (const s of windowShifts) {
        const arr = byDayBefore.get(s.date) ?? [];
        arr.push(s);
        byDayBefore.set(s.date, arr);
      }
      // Count failing fully-covered windows containing candidate.date, per state.
      const failingWindows = (byDay: Map<string, StatutoryShift[]>): number => {
        let failures = 0;
        for (let back = CCN_SHARED.REST_WINDOW_DAYS - 1; back >= 0; back--) {
          const ws = addDays(candidate.date, -back);
          const we = addDays(ws, CCN_SHARED.REST_WINDOW_DAYS - 1);
          if (ws < coverage.start || we > coverage.end) continue;
          let windowHasTrigger = false;
          const restDates: string[] = [];
          for (let i = 0; i < CCN_SHARED.REST_WINDOW_DAYS; i++) {
            const d = addDays(ws, i);
            const ds = byDay.get(d);
            if (!ds || ds.length === 0) restDates.push(d);
            else if (!windowHasTrigger && isTrigger(ds))
              windowHasTrigger = true;
          }
          if (!windowHasTrigger) continue;
          let hasPair = false;
          let hasSundayPair = false;
          for (let i = 0; i < restDates.length - 1; i++) {
            if (dayDiff(restDates[i + 1], restDates[i]) === 1) {
              hasPair = true;
              if (isSunday(restDates[i]) || isSunday(restDates[i + 1]))
                hasSundayPair = true;
            }
          }
          if (
            restDates.length < CCN_SHARED.REST_MIN_DAYS_IN_WINDOW ||
            !hasPair ||
            (sundayHard && !hasSundayPair)
          ) {
            failures++;
          }
        }
        return failures;
      };
      if (failingWindows(byDayWith) > failingWindows(byDayBefore))
        kinds.push('REST_DAYS_WINDOW');
    }
  }

  // KON-139 — 44h average over 12 consecutive ISO weeks, introduced-by-candidate. Only
  // windows whose 12 weeks are all known (ending <= lastWeekMonday) are judged; later
  // windows are re-checked when their own last week receives assignments.
  if (opts.twelveWeek) {
    const { totals, lastWeekMonday } = opts.twelveWeek;
    const candNet = shiftNetMinutes(candidate);
    const candWeek = isoWeekStart(candidate.date);
    for (let e = candWeek; e <= lastWeekMonday; e = addDays(e, 7)) {
      // window [e-11w, e] contains candWeek by construction (e >= candWeek >= e-11w)
      if (dayDiff(e, candWeek) >= CCN_SHARED.TWELVE_WEEK_SPAN * 7) break;
      let before = 0;
      for (let i = 0; i < CCN_SHARED.TWELVE_WEEK_SPAN; i++)
        before += totals(addDays(e, -7 * i));
      const after = before + candNet;
      if (
        after > CCN_SHARED.MAX_TWELVE_WEEK_TOTAL_MINUTES &&
        before <= CCN_SHARED.MAX_TWELVE_WEEK_TOTAL_MINUTES
      ) {
        kinds.push('TWELVE_WEEK_AVG');
        break;
      }
    }
  }

  return kinds;
}
