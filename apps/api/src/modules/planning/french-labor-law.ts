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
 *  - L.3131-1  : 11h minimum daily rest (=> 13h amplitude)  -> MAX_DAILY_AMPLITUDE_MINUTES
 *  - L.3132-2  : 35h minimum consecutive weekly rest        -> MIN_WEEKLY_REST_HOURS
 *  - L.3132-1  : one rest day per 7 (max 6 worked in a row) -> MAX_CONSECUTIVE_WORK_DAYS
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
  minWeeklyRestHours: FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS,
  maxConsecutiveWorkDays: FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS,
} as const;

export type StatutoryViolationKind =
  | 'DAILY_WORK'
  | 'DAILY_AMPLITUDE'
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
 * shifts on both sides is credited in FULL — so a Saturday-evening -> Monday-morning rest
 * that straddles the week boundary satisfies the week it overlaps (no false positive). But
 * an OPEN end (the -BIG lead / +BIG trail sentinel, i.e. no shift before the first / after
 * the last in the provided window) is clipped to the week boundary: unknown rest beyond the
 * data window is NOT credited, so a week worked dense to its last day is flagged.
 */
function clampGapLen(gs: number, ge: number, lo: number, hi: number): number {
  const start = gs <= -BIG ? lo : gs;
  const end = ge >= BIG ? hi : ge;
  return end - start;
}

/** True if the ISO week starting `weekStart` has NO >=35h rest gap overlapping it.
 *  `allShifts` may span beyond the week — neighbours are needed for boundary straddle. */
function weekHasRestDeficit(
  allShifts: StatutoryShift[],
  weekStart: string,
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
    ([gs, ge]) => clampGapLen(gs, ge, lo, hi) >= restMin,
  );
}

/**
 * POST-HOC scan — every statutory breach in one employee's shift set.
 * `shifts` MUST all belong to the same employee. Pure.
 */
export function findStatutoryViolations(
  shifts: StatutoryShift[],
): StatutoryViolation[] {
  const out: StatutoryViolation[] = [];

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
  }

  // Consecutive days — report the day at which a run first exceeds the max.
  const sortedDays = [...byDay.keys()].sort();
  let run = 0;
  let prev: string | null = null;
  for (const d of sortedDays) {
    run = prev !== null && dayDiff(d, prev) === 1 ? run + 1 : 1;
    if (run === FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS + 1) {
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
      !overlapping.some(([gs, ge]) => clampGapLen(gs, ge, lo, hi) >= restMin)
    ) {
      const best = overlapping.reduce(
        (m, [gs, ge]) => Math.max(m, clampGapLen(gs, ge, lo, hi)),
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

  return out;
}

/**
 * INCREMENTAL check — which statutory limits adding `candidate` would breach for an
 * employee who already holds `windowShifts` (same employee). Only breaches INTRODUCED by
 * the candidate are returned (a pre-existing breach in `windowShifts` is not re-flagged),
 * so it never blocks an assignment that cannot make things worse. Used to reject a single
 * generation candidate / manual create / manual move before it is written. `windowShifts`
 * SHOULD span at least the candidate's ISO week +/- 1 day so weekly-rest and consecutive-day
 * runs that straddle a week boundary are seen.
 */
export function wouldExceedStatutory(
  windowShifts: StatutoryShift[],
  candidate: StatutoryShift,
): StatutoryViolationKind[] {
  const kinds: StatutoryViolationKind[] = [];
  const withCandidate = [...windowShifts, candidate];

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
    weekHasRestDeficit(withCandidate, wk) &&
    !weekHasRestDeficit(windowShifts, wk)
  ) {
    kinds.push('WEEKLY_REST');
  }

  return kinds;
}
