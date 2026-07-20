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

export const FRENCH_LABOR_LAW = {
  /** L.3121-18 — max 10h net worked per employee per calendar day. */
  MAX_DAILY_WORK_MINUTES: 600,
  /** 13h max amplitude (first start -> last end) per employee per day; breaks included. */
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
  | 'CONSECUTIVE_DAYS';

/** Minimal shift shape the statutory checks need. `date` = `YYYY-MM-DD`, times = `HH:MM`. */
export type StatutoryShift = {
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
};

export type StatutoryViolation = {
  kind: StatutoryViolationKind;
  /** Day the breach is attributed to (DAILY_*, CONSECUTIVE_DAYS = offending day; WEEKLY_REST = ISO-week Monday). */
  date: string;
  /** Measured value: minutes for DAILY_*, hours for WEEKLY_REST, days for CONSECUTIVE_DAYS. */
  actual: number;
  /** The statutory limit that was exceeded, in the same unit as `actual`. */
  limit: number;
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

function isoWeekStart(dateStr: string): string {
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
  window?: { start: string; end: string },
): StatutoryViolation[] {
  const out: StatutoryViolation[] = [];
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
    if (amplitude > FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES) {
      out.push({
        kind: 'DAILY_AMPLITUDE',
        date,
        actual: amplitude,
        limit: FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES,
      });
    }
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

  return out;
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
): StatutoryViolationKind[] {
  const kinds: StatutoryViolationKind[] = [];
  const withCandidate = [...windowShifts, candidate];
  const win = {
    lo: shiftEpoch(addDays(candidate.date, -8)),
    hi: shiftEpoch(addDays(candidate.date, 8)) + MIN_PER_DAY,
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
  if (
    dayAmplitudeMinutes(dayAfter) >
      FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES &&
    dayAmplitudeMinutes(dayBefore) <=
      FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES
  ) {
    kinds.push('DAILY_AMPLITUDE');
  }

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

  return kinds;
}
