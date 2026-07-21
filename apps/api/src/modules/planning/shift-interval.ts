/**
 * Shift interval primitive — Story 13-3 (KON-132).
 *
 * Single source of truth for turning a (date, HH:MM) pair into an ABSOLUTE minute
 * interval, so every overlap check in the engine agrees on what "overnight" means.
 * Pure: no NestJS, no Prisma, no I/O, no RNG, no wall-clock — importable from the
 * solver IR (solver-model.ts, which must stay package-agnostic) and from the
 * statutory module (french-labor-law.ts) alike. That neutrality is why this lives
 * in its own file rather than being exported from french-labor-law.ts.
 *
 * Convention (already unanimous in the codebase — rule-engine.ts netMinutes:82,
 * french-labor-law.ts shiftNetMinutes:101, solver-model.ts netMinutes:123 and the
 * service's calculateShiftMinutes:3585):
 *   endTime  >  startTime  -> same-day shift
 *   endTime  <  startTime  -> overnight: the shift ends on the NEXT calendar day
 *   endTime === startTime  -> zero-length slot (NOT a 24h shift)
 *
 * Dates are 'YYYY-MM-DD' at UTC midnight; times are 'HH:MM'. Minute arithmetic
 * only — DST-immune by design (epic-13-context.md § 3, invariant 8).
 */

const MIN_PER_DAY = 1440;
const EPOCH = '1970-01-01';

/** Minimal shape any overlap check needs. Structurally satisfied by AssignedShift, SlotRequirement and SolverSlot. */
export type IntervalShift = {
  date: string;
  startTime: string;
  endTime: string;
};

/** Absolute minute interval, half-open [start, end). */
export type AbsoluteInterval = [number, number];

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function dayIndex(dateStr: string): number {
  const day = Date.parse(`${dateStr}T00:00:00.000Z`);
  const epoch = Date.parse(`${EPOCH}T00:00:00.000Z`);
  return Math.round((day - epoch) / 86_400_000);
}

/**
 * Absolute [start, end) minute interval since EPOCH. An overnight shift extends
 * past midnight into the next calendar day.
 */
export function toAbsoluteInterval(shift: IntervalShift): AbsoluteInterval {
  const base = dayIndex(shift.date) * MIN_PER_DAY;
  const startM = toMinutes(shift.startTime);
  const endM = toMinutes(shift.endTime);
  return [base + startM, base + (endM >= startM ? endM : endM + MIN_PER_DAY)];
}

/**
 * True when two absolute intervals occupy the same real time. A zero-length
 * interval is empty, so it overlaps nothing — without the emptiness guard the
 * half-open test reports a hit whenever the degenerate point falls strictly
 * inside the other interval, which would block an employee on a 0-minute slot.
 */
export function intervalsOverlap(
  a: AbsoluteInterval,
  b: AbsoluteInterval,
): boolean {
  if (a[0] >= a[1] || b[0] >= b[1]) return false;
  return a[0] < b[1] && b[0] < a[1];
}

/** True when two shifts occupy the same real time, midnight crossings included. */
export function shiftsOverlap(a: IntervalShift, b: IntervalShift): boolean {
  return intervalsOverlap(toAbsoluteInterval(a), toAbsoluteInterval(b));
}

/**
 * Real rest gap in minutes between two shifts, in either chronological order.
 * Negative when they overlap.
 */
export function restMinutesBetween(a: IntervalShift, b: IntervalShift): number {
  const [aStart, aEnd] = toAbsoluteInterval(a);
  const [bStart, bEnd] = toAbsoluteInterval(b);
  return Math.max(bStart - aEnd, aStart - bEnd);
}
