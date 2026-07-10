# Story: 11-3-french-labor-law-hard-rules — French Labor Law as Default Hard Rules

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** done
**Branch:** feature/KON-120-11-3-french-labor-law-hard-rules
**Ticket:** KON-120 (Linear · project Pawly · milestone Epic 11 · blocks KON-125 / 11-8)
**Origin:** Multi-agent planning audit 2026-07-08 — confirmed reliability/compliance gap: *"No French labor law by default. All hard limits live inside `for (const rule of hardContractRules)`; zero configured `CONTRACT_COMPLIANCE` rule = zero exclusion."* See `docs/epics-context/epic-11-context.md` § 0. This story is Wave W1 (no deps) and **unblocks 11-8** (unified rule engine), which will later fold these four checks into a single evaluator.

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, file:line anchors, and the cross-cutting invariants every Epic 11 story MUST preserve. Line numbers below were re-verified against `develop` during authoring (post 11-1 + 11-2 merge); **re-locate the symbol, do not trust the number blindly.**

## User Story

**As a** clinic operating under French labor law, **I want** statutory rest and working-time limits enforced by default, **so that** a generated or manually edited schedule cannot silently produce an illegal roster.

## Acceptance Criteria

1. **AC1 — Generation.** **Given** any clinic, with or without admin-configured planning rules, **When** the monthly schedule is generated, **Then** no employee is scheduled beyond the statutory limits — more than **10h net worked on a calendar day**, more than **13h daily amplitude** (first start → last end), a **7th consecutive worked day**, or a **week with less than 35h continuous rest** — even for a clinic with zero configured rules; the generator leaves the slot unfilled (a hole) or assigns a compliant employee instead.
2. **AC2 — Manual edits.** **Given** a DRAFT or PUBLISHED month, **When** an admin manually adds a shift or moves a shift such that an employee would exceed a statutory limit, **Then** the action is blocked — the add is rejected with a conflict error, and the move surfaces a blocking (hard) conflict in the drag interface.
3. **AC3 — Health Bar + publication.** **Given** persisted shifts that breach a statutory limit, **When** the admin views the schedule, **Then** each breach appears as a blocking (hard) violation in the Planning Health Bar detail popover, localized in the admin's language, and publication of the month is blocked until the breaches are resolved.
4. **AC4 — Seeded default + zero-rule safety net.** **Given** a clinic completing onboarding, **When** onboarding finishes, **Then** a visible, non-disableable *"French labor-law limits"* rule appears in the clinic's planning rules; **and** the statutory limits are enforced (AC1–AC3) even for a clinic that has never configured or seeded any rule.

**FRs covered:** FR3, FR7 (extended to statutory limits). **NFRs:** NFR3 (no silent illegal roster).

> **Mechanism map (AC → surface, realized in Tasks):** AC1 → generation eligibility filter (`scoreAndAssign`, Task 5). AC2 → `createManualShift` (`ConflictException`) + `preValidateMove` (hard entry) (Task 6). AC3 → always-on statutory pass in `validateShiftsAgainstRules` emitting HARD violations with localized `messageKey` (Tasks 4, 7, 9); publication is already gated on hard violations in `publishPlan` (no change). AC4 → seeded row in `completeOnboarding` (Task 8) + hard-coded constants in `french-labor-law.ts` (Task 1) that never read the row.

> **Scope decisions locked with Alex during authoring (GATE step-04):**
> - **Statutory model = hard-coded floor + visible seeded row.** The four limits live as constants in `french-labor-law.ts` and are the *sole* enforcement across all surfaces. The onboarding seed is **visibility only**; enforcement never depends on it.
> - **All four surfaces enforced:** generation eligibility (exclude), validation → Health Bar + publish gate (HARD), `preValidateMove` (HARD in drag UI), `createManualShift` (`ConflictException`).
> - **HARD-violation localization:** add optional `messageKey`/`messageParams` to the hard-violation shape and relax `ruleId` to `z.string()` (statutory violations carry a synthetic id `statutory:<kind>`).
> - **Weekly rest (35h) — REVISED from the step-04 proxy.** The proposal was a "max-6-consecutive-days proxy" in generation. During authoring I found a counter-example (worked Mon–Sat, Sat ends 18:00, Sun off ⇒ only 30h in-week rest < 35h) that the proxy would pass but validation would then flag HARD, blocking publish with no easy fix. **Resolution:** enforce the *exact*, boundary-aware weekly-rest check on **every** surface (generation included). The per-candidate cost is O(shifts in a ±8-day window) ≈ trivial (~≤14 shifts, merge of ≤14 intervals) — the real generation hotspot (rotation scoring) is 11-10's problem, not this. See Dev Notes § "Weekly-rest semantics".

## Tasks

- [x] **Task 1: Create the pure statutory module `french-labor-law.ts`** [AC: 1, 2, 3, 4]
  Create `apps/api/src/modules/planning/french-labor-law.ts` with the full contents below. Pure module — no NestJS, no Prisma, no I/O. This is the single hard-coded source of truth consumed by all four surfaces.
  ```ts
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
   * shifts (endTime <= startTime) wrap past midnight.
   */

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
  function mergedBusyIntervals(shifts: StatutoryShift[]): Array<[number, number]> {
    const intervals = shifts.map((s) => {
      const base = shiftEpoch(s.date);
      const startM = toMinutes(s.startTime);
      const endM = toMinutes(s.endTime);
      const start = base + startM;
      const end = base + (endM >= startM ? endM : endM + MIN_PER_DAY);
      return [start, end] as [number, number];
    });
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
    for (let i = 0; i < busy.length - 1; i++) gaps.push([busy[i][1], busy[i + 1][0]]);
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

  /** True if the ISO week starting `weekStart` has NO >=35h rest gap overlapping it.
   *  `allShifts` may span beyond the week — neighbours are needed for boundary straddle. */
  function weekHasRestDeficit(allShifts: StatutoryShift[], weekStart: string): boolean {
    const worked = allShifts.some((s) => isoWeekStart(s.date) === weekStart);
    if (!worked) return false;
    const lo = shiftEpoch(weekStart);
    const hi = lo + 7 * MIN_PER_DAY;
    const restMin = FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS * 60;
    const overlapping = restGaps(allShifts).filter(([gs, ge]) => gs < hi && ge > lo);
    return !overlapping.some(([gs, ge]) => ge - gs >= restMin);
  }

  /**
   * POST-HOC scan — every statutory breach in one employee's shift set.
   * `shifts` MUST all belong to the same employee. Pure.
   */
  export function findStatutoryViolations(shifts: StatutoryShift[]): StatutoryViolation[] {
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
        out.push({ kind: 'DAILY_WORK', date, actual: worked, limit: FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES });
      }
      const amplitude = dayAmplitudeMinutes(dayShifts);
      if (amplitude > FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES) {
        out.push({ kind: 'DAILY_AMPLITUDE', date, actual: amplitude, limit: FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES });
      }
    }

    // Consecutive days — report the day at which a run first exceeds the max.
    const sortedDays = [...byDay.keys()].sort();
    let run = 0;
    let prev: string | null = null;
    for (const d of sortedDays) {
      run = prev !== null && dayDiff(d, prev) === 1 ? run + 1 : 1;
      if (run === FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS + 1) {
        out.push({ kind: 'CONSECUTIVE_DAYS', date: d, actual: run, limit: FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS });
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
      if (!overlapping.some(([gs, ge]) => ge - gs >= restMin)) {
        const best = overlapping.reduce((m, [gs, ge]) => Math.max(m, ge - gs), 0);
        out.push({ kind: 'WEEKLY_REST', date: wk, actual: Math.floor(best / 60), limit: FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS });
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
      dayAmplitudeMinutes(dayAfter) > FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES &&
      dayAmplitudeMinutes(dayBefore) <= FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES
    ) {
      kinds.push('DAILY_AMPLITUDE');
    }

    // Consecutive days — only when the candidate adds a NEW worked day
    const datesBefore = new Set(windowShifts.map((s) => s.date));
    if (!datesBefore.has(candidate.date)) {
      const runWith = runLengthThrough(new Set(withCandidate.map((s) => s.date)), candidate.date);
      if (runWith > FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS) kinds.push('CONSECUTIVE_DAYS');
    }

    // Weekly rest — candidate's ISO week, introduced-by-candidate
    const wk = isoWeekStart(candidate.date);
    if (weekHasRestDeficit(withCandidate, wk) && !weekHasRestDeficit(windowShifts, wk)) {
      kinds.push('WEEKLY_REST');
    }

    return kinds;
  }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no error lines referencing `french-labor-law.ts`, exit 0.
  Commit: `git add apps/api/src/modules/planning/french-labor-law.ts && git commit -m "feat(KON-120): add pure French labor-law statutory limits module"`

- [x] **Task 2: Unit-test the statutory module** [AC: 1, 3]
  Create `apps/api/src/modules/planning/french-labor-law.spec.ts`. Cover each limit with a passing case, a breaching case, and the boundary. Minimum cases below (add more if a branch is uncovered).
  ```ts
  import {
    FRENCH_LABOR_LAW,
    STATUTORY_RULE_CONFIG,
    dayWorkedMinutes,
    dayAmplitudeMinutes,
    maxConsecutiveWorkedDays,
    findStatutoryViolations,
    wouldExceedStatutory,
    type StatutoryShift,
  } from './french-labor-law';

  const shift = (date: string, startTime: string, endTime: string, breakMinutes = 0): StatutoryShift => ({
    date,
    startTime,
    endTime,
    breakMinutes,
  });

  describe('french-labor-law constants', () => {
    it('exposes the four statutory limits', () => {
      expect(FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES).toBe(600);
      expect(FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES).toBe(780);
      expect(FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS).toBe(35);
      expect(FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS).toBe(6);
    });
    it('STATUTORY_RULE_CONFIG mirrors the constants in hours', () => {
      expect(STATUTORY_RULE_CONFIG).toEqual({
        maxDailyHours: 10,
        maxDailyAmplitudeHours: 13,
        minWeeklyRestHours: 35,
        maxConsecutiveWorkDays: 6,
      });
    });
  });

  describe('daily work + amplitude', () => {
    it('nets out break minutes', () => {
      expect(dayWorkedMinutes([shift('2026-08-03', '08:00', '19:00', 60)])).toBe(600); // 11h - 1h = 10h
    });
    it('flags > 10h net worked on a day', () => {
      const v = findStatutoryViolations([shift('2026-08-03', '08:00', '19:00', 0)]); // 11h net
      expect(v).toContainEqual(expect.objectContaining({ kind: 'DAILY_WORK', date: '2026-08-03' }));
    });
    it('does not flag exactly 10h net worked', () => {
      const v = findStatutoryViolations([shift('2026-08-03', '08:00', '18:00', 0)]); // 10h
      expect(v.filter((x) => x.kind === 'DAILY_WORK')).toHaveLength(0);
    });
    it('amplitude spans earliest start to latest end across split shifts', () => {
      const day = [shift('2026-08-03', '08:00', '12:00', 0), shift('2026-08-03', '18:00', '22:00', 0)];
      expect(dayAmplitudeMinutes(day)).toBe(14 * 60); // 08:00 -> 22:00
      const v = findStatutoryViolations(day);
      expect(v).toContainEqual(expect.objectContaining({ kind: 'DAILY_AMPLITUDE' }));
    });
  });

  describe('consecutive days', () => {
    it('counts the longest run', () => {
      const dates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-07'];
      expect(maxConsecutiveWorkedDays(dates)).toBe(3);
    });
    it('flags a 7th consecutive worked day', () => {
      const week = ['03', '04', '05', '06', '07', '08', '09'].map((d) => shift(`2026-08-${d}`, '09:00', '15:00', 0));
      const v = findStatutoryViolations(week);
      expect(v).toContainEqual(expect.objectContaining({ kind: 'CONSECUTIVE_DAYS', date: '2026-08-09' }));
    });
    it('does not flag 6 consecutive worked days', () => {
      const week = ['03', '04', '05', '06', '07', '08'].map((d) => shift(`2026-08-${d}`, '09:00', '15:00', 0));
      expect(findStatutoryViolations(week).filter((x) => x.kind === 'CONSECUTIVE_DAYS')).toHaveLength(0);
    });
  });

  describe('weekly rest (>=35h, boundary-aware)', () => {
    // ISO week Mon 2026-08-03 .. Sun 2026-08-09. Work Mon-Sat 09:00-18:00, Sat ends late.
    it('flags a week whose only in-week rest is < 35h', () => {
      const week = ['03', '04', '05', '06', '07', '08'].map((d) => shift(`2026-08-${d}`, '09:00', '20:00', 0));
      const v = findStatutoryViolations(week); // Sat 20:00 -> Sun 24:00 = 28h only
      expect(v).toContainEqual(expect.objectContaining({ kind: 'WEEKLY_REST', date: '2026-08-03' }));
    });
    it('credits rest that straddles into the next week when neighbours are present', () => {
      const week = ['03', '04', '05', '06', '07'].map((d) => shift(`2026-08-${d}`, '09:00', '17:00', 0));
      const next = [shift('2026-08-11', '09:00', '17:00', 0)]; // Fri 17:00 -> Tue next 09:00 >> 35h
      expect(findStatutoryViolations([...week, ...next]).filter((x) => x.kind === 'WEEKLY_REST')).toHaveLength(0);
    });
  });

  describe('wouldExceedStatutory (incremental)', () => {
    it('blocks a candidate that tips the day over 10h net', () => {
      const window = [shift('2026-08-03', '08:00', '14:00', 0)]; // 6h
      const candidate = shift('2026-08-03', '14:00', '19:00', 0); // +5h = 11h
      expect(wouldExceedStatutory(window, candidate)).toContain('DAILY_WORK');
    });
    it('blocks the 7th consecutive day', () => {
      const window = ['03', '04', '05', '06', '07', '08'].map((d) => shift(`2026-08-${d}`, '09:00', '15:00', 0));
      expect(wouldExceedStatutory(window, shift('2026-08-09', '09:00', '15:00', 0))).toContain('CONSECUTIVE_DAYS');
    });
    it('returns [] when the candidate cannot make things worse (window already over)', () => {
      const window = [shift('2026-08-03', '08:00', '20:00', 0)]; // already 12h
      const candidate = shift('2026-08-05', '09:00', '15:00', 0); // unrelated day
      expect(wouldExceedStatutory(window, candidate)).toEqual([]);
    });
  });
  ```
  Run: `pnpm --filter @pawly/api test -- french-labor-law`
  Expected: `Tests:` all passed (≥ 12 passing), exit 0.
  Commit: `git add apps/api/src/modules/planning/french-labor-law.spec.ts && git commit -m "test(KON-120): unit-test statutory limits module"`

- [x] **Task 3: Extend `contractComplianceConfigSchema` with the statutory fields** [AC: 4]
  In `packages/validators/src/planning/planning-rule.schema.ts`, replace the current `contractComplianceConfigSchema` block (currently lines 54–64) — anchor on:
  ```ts
  export const contractComplianceConfigSchema = z
    .object({
      maxWeeklyHours: z.number().int().min(1).optional(),
      maxMonthlyHours: z.number().int().min(1).optional(),
      overtimeThresholdPercent: z.number().min(0).max(100).optional(),
      minRestHoursBetweenShifts: z.number().min(1).max(24).optional(),
    })
    .refine(
      (data) => data.maxWeeklyHours !== undefined || data.maxMonthlyHours !== undefined || data.minRestHoursBetweenShifts !== undefined,
      "At least one constraint (hour limit or rest hours) must be defined"
    );
  ```
  with:
  ```ts
  export const contractComplianceConfigSchema = z
    .object({
      maxWeeklyHours: z.number().int().min(1).optional(),
      maxMonthlyHours: z.number().int().min(1).optional(),
      overtimeThresholdPercent: z.number().min(0).max(100).optional(),
      minRestHoursBetweenShifts: z.number().min(1).max(24).optional(),
      // Story 11-3 — statutory French labor-law limits. Carried by the seeded HARD rule for
      // admin visibility; the hard-coded enforcement lives in french-labor-law.ts and does
      // NOT read these values, so a clinic with zero rules is still protected.
      maxDailyHours: z.number().min(1).max(24).optional(),
      maxDailyAmplitudeHours: z.number().min(1).max(24).optional(),
      minWeeklyRestHours: z.number().min(24).max(168).optional(),
      maxConsecutiveWorkDays: z.number().int().min(1).max(7).optional(),
    })
    .refine(
      (data) =>
        data.maxWeeklyHours !== undefined ||
        data.maxMonthlyHours !== undefined ||
        data.minRestHoursBetweenShifts !== undefined ||
        data.maxDailyHours !== undefined ||
        data.maxDailyAmplitudeHours !== undefined ||
        data.minWeeklyRestHours !== undefined ||
        data.maxConsecutiveWorkDays !== undefined,
      "At least one constraint (hour limit, rest hours, or statutory limit) must be defined"
    );
  ```
  Then in `packages/validators/src/planning/planning-rule.schema.test.ts`, add cases: a config with only `maxDailyHours: 10` **passes**; a config with only the statutory fields (the seed shape `{ maxDailyHours: 10, maxDailyAmplitudeHours: 13, minWeeklyRestHours: 35, maxConsecutiveWorkDays: 6 }`) **passes**; an empty `{}` still **fails** the refine.
  Run: `pnpm --filter @pawly/validators test -- planning-rule`
  Expected: `Test Files ... passed`, all assertions pass, exit 0.
  Commit: `git add packages/validators/src/planning/planning-rule.schema.ts packages/validators/src/planning/planning-rule.schema.test.ts && git commit -m "feat(KON-120): add statutory fields to contract-compliance config schema"`

- [x] **Task 4: Relax the hard-violation shape for localized statutory violations** [AC: 3]
  In `packages/validators/src/planning/schedule-view.schema.ts`, replace the `hard` array element (currently lines 126–136) — anchor on:
  ```ts
    hard: z.array(
      z.object({
        ruleId: z.string().uuid(),
        ruleName: z.string(),
        category: z.string(),
        message: z.string(),
        affectedEmployeeId: z.string().uuid().optional(),
        affectedDate: z.string().optional(),
        severity: z.literal("blocking"),
      })
    ),
  ```
  with (relax `ruleId` to `z.string()` for synthetic `statutory:*` ids, add optional `messageKey`/`messageParams` mirroring the soft shape):
  ```ts
    hard: z.array(
      z.object({
        ruleId: z.string(),
        ruleName: z.string(),
        category: z.string(),
        message: z.string(),
        messageKey: z.string().optional(),
        messageParams: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        affectedEmployeeId: z.string().uuid().optional(),
        affectedDate: z.string().optional(),
        severity: z.literal("blocking"),
      })
    ),
  ```
  In `packages/validators/src/planning/schedule-view.schema.test.ts`, add a case: a hard violation with `ruleId: "statutory:daily_work"`, `messageKey: "violations.statutory.dailyWork"`, `messageParams: { date: "2026-08-03", actual: 11, limit: 10 }` **parses successfully**.
  Run: `pnpm --filter @pawly/validators test -- schedule-view`
  Expected: `Test Files ... passed`, exit 0.
  Commit: `git add packages/validators/src/planning/schedule-view.schema.ts packages/validators/src/planning/schedule-view.schema.test.ts && git commit -m "feat(KON-120): allow synthetic ruleId + messageKey on hard violations"`

- [x] **Task 5: Enforce statutory limits in generation eligibility (`scoreAndAssign`)** [AC: 1]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, add the import near the top (alongside the other `./` imports):
  ```ts
  import { wouldExceedStatutory, type StatutoryShift } from './french-labor-law';
  ```
  Then, inside the `scoreAndAssign` eligibility `.filter((emp) => { ... })`, insert the statutory block **after** the `for (const rule of hardContractRules) { ... }` loop closes and **before** the `if (blockedByRotationEquity)` check. Anchor on (currently lines 1023–1026):
  ```ts
            }
          }
        }

        if (blockedByRotationEquity) {
  ```
  Replace with (keep the three closing braces, insert the statutory block between them and the `if`):
  ```ts
            }
          }
        }

        // Story 11-3 — French labor-law HARD limits (non-disableable, independent of DB
        // rules). Reject any candidate whose assignment would newly breach 10h/day worked,
        // 13h amplitude, a 7th consecutive worked day, or the 35h weekly rest. Window =
        // this employee's already-assigned shifts within +/-8 days of the slot (covers the
        // ISO week and any run/rest that straddles a week boundary).
        {
          const statutoryWindow: StatutoryShift[] = [];
          let cursor = this.getPreviousDate(slot.date);
          for (let i = 0; i < 8; i++) {
            statutoryWindow.push(...(assignmentIndex.get(`${emp.id}|${cursor}`) || []));
            cursor = this.getPreviousDate(cursor);
          }
          cursor = slot.date;
          for (let i = 0; i < 9; i++) {
            statutoryWindow.push(...(assignmentIndex.get(`${emp.id}|${cursor}`) || []));
            cursor = this.getNextDate(cursor);
          }
          const statutoryBreach = wouldExceedStatutory(statutoryWindow, {
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            breakMinutes: slot.breakMinutes,
          });
          if (statutoryBreach.length > 0) return false;
        }

        if (blockedByRotationEquity) {
  ```
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add a generation test: a clinic with **zero** planning rules whose config/contract would let an employee be assigned a 7th consecutive day (or an 11h day) — assert the generator leaves a hole / assigns someone else rather than producing the illegal assignment for that employee.
  Run: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: `Tests:` all passed (existing + new), exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "feat(KON-120): enforce statutory limits in generation eligibility"`

- [x] **Task 6: Enforce statutory limits on manual create + move** [AC: 2]
  In `apps/api/src/modules/planning/planning-generation.service.ts`:
  **(a) `createManualShift`** — insert the statutory pre-check between the overlap `for` loop and the `const created = await this.prisma.shift.create(...)`. Anchor on (currently lines 2192–2195):
  ```ts
        );
      }
    }

    const created = await this.prisma.shift.create({
  ```
  Replace with:
  ```ts
        );
      }
    }

    // Story 11-3 — statutory French labor-law HARD check. Load the employee's shifts in a
    // window around the target day (ISO week + neighbours) and reject the create if it would
    // breach a statutory limit. Enforced regardless of configured rules.
    const statWindowStart = new Date(`${input.date}T00:00:00.000Z`);
    statWindowStart.setUTCDate(statWindowStart.getUTCDate() - 8);
    const statWindowEnd = new Date(`${input.date}T00:00:00.000Z`);
    statWindowEnd.setUTCDate(statWindowEnd.getUTCDate() + 8);
    const statWindowShifts = await this.prisma.shift.findMany({
      where: {
        employeeId: input.employeeId,
        clinicId,
        date: { gte: statWindowStart, lte: statWindowEnd },
      },
    });
    const createBreaches = wouldExceedStatutory(
      statWindowShifts.map((s) => ({
        date: s.date.toISOString().split('T')[0],
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
      })),
      {
        date: input.date,
        startTime: shiftType.startTime,
        endTime: shiftType.endTime,
        breakMinutes: shiftType.breakMinutes,
      },
    );
    if (createBreaches.length > 0) {
      throw new ConflictException(
        `Shift would breach French labor-law limit(s): ${createBreaches.join(', ')}`,
      );
    }

    const created = await this.prisma.shift.create({
  ```
  **(b) `preValidateMove`** — insert the statutory HARD check immediately **before** the final `return { hard, soft };`. Anchor on (currently lines 2564–2566):
  ```ts
        });
      }
    }

    return { hard, soft };
  ```
  Replace with:
  ```ts
        });
      }
    }

    // Story 11-3 — statutory French labor-law HARD check on the moved shift. `monthShifts`
    // (target employee, target month, excluding the moved shift) is the window; the candidate
    // is the moved shift placed at the target date.
    const moveBreaches = wouldExceedStatutory(
      monthShifts.map((s) => ({
        date: s.date.toISOString().split('T')[0],
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
      })),
      {
        date: input.targetDate,
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
      },
    );
    for (const kind of moveBreaches) {
      hard.push({ rule: 'CONTRACT_COMPLIANCE', message: `Statutory limit exceeded: ${kind}` });
    }

    return { hard, soft };
  ```
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add: (1) `createManualShift` throws `ConflictException` when the new shift makes the employee's day exceed 10h net; (2) `preValidateMove` returns a `hard` entry with `rule: 'CONTRACT_COMPLIANCE'` when the move would create a 7th consecutive day.
  Run: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: `Tests:` all passed, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "feat(KON-120): enforce statutory limits on manual create + move"`

- [x] **Task 7: Emit statutory HARD violations from `validateShiftsAgainstRules`** [AC: 3]
  In `apps/api/src/modules/planning/planning.service.ts`:
  **(a)** Add the import (near the top, with the other `./` imports):
  ```ts
  import {
    findStatutoryViolations,
    STATUTORY_RULE_NAME,
    type StatutoryShift,
    type StatutoryViolation,
    type StatutoryViolationKind,
  } from './french-labor-law';
  ```
  **(b)** Extend the `HardViolation` type (currently lines 29–37) — anchor on:
  ```ts
  type HardViolation = {
    ruleId: string;
    ruleName: string;
    category: PlanningRuleCategory;
    message: string;
    affectedEmployeeId?: string;
    affectedDate?: string;
    severity: 'blocking';
  };
  ```
  Replace with (add `messageKey`/`messageParams`):
  ```ts
  type HardViolation = {
    ruleId: string;
    ruleName: string;
    category: PlanningRuleCategory;
    message: string;
    messageKey?: string;
    messageParams?: Record<string, string | number>;
    affectedEmployeeId?: string;
    affectedDate?: string;
    severity: 'blocking';
  };
  ```
  **(c)** Wire the always-on statutory pass into `validateShiftsAgainstRules`, immediately **before** `return { hardViolations, softViolations, rules };` (currently line 192). Anchor on:
  ```ts
      }
    }

    return { hardViolations, softViolations, rules };
  }
  ```
  Replace with:
  ```ts
      }
    }

    // Story 11-3 — statutory French labor-law HARD limits, ALWAYS enforced (independent of
    // configured rules). Surfaces in the Planning Health Bar and blocks publication.
    this.evaluateStatutoryLimits(validShifts, hardViolations);

    return { hardViolations, softViolations, rules };
  }
  ```
  **(d)** Add the private method + mapper. Insert `evaluateStatutoryLimits` immediately after the `validateShiftsAgainstRules` method's closing brace (before `private evaluateStaffingMinimum`). Anchor on:
  ```ts
    return { hardViolations, softViolations, rules };
  }

    private evaluateStaffingMinimum(
  ```
  (note the actual indentation of `private evaluateStaffingMinimum` in the file) — insert between them:
  ```ts
    return { hardViolations, softViolations, rules };
  }

    private static readonly STATUTORY_MESSAGE_KEY: Record<StatutoryViolationKind, string> = {
      DAILY_WORK: 'violations.statutory.dailyWork',
      DAILY_AMPLITUDE: 'violations.statutory.dailyAmplitude',
      WEEKLY_REST: 'violations.statutory.weeklyRest',
      CONSECUTIVE_DAYS: 'violations.statutory.consecutiveDays',
    };

    private evaluateStatutoryLimits(
      shifts: Array<{
        date: Date;
        startTime: string;
        endTime: string;
        breakMinutes: number;
        employee: { id: string };
      }>,
      hardViolations: HardViolation[],
    ) {
      const byEmployee = new Map<string, StatutoryShift[]>();
      for (const s of shifts) {
        const arr = byEmployee.get(s.employee.id) ?? [];
        arr.push({
          date: s.date.toISOString().split('T')[0],
          startTime: s.startTime,
          endTime: s.endTime,
          breakMinutes: s.breakMinutes,
        });
        byEmployee.set(s.employee.id, arr);
      }

      for (const [employeeId, empShifts] of byEmployee) {
        for (const v of findStatutoryViolations(empShifts)) {
          hardViolations.push(this.statutoryToHardViolation(v, employeeId));
        }
      }
    }

    private statutoryToHardViolation(
      v: StatutoryViolation,
      employeeId: string,
    ): HardViolation {
      const isDaily = v.kind === 'DAILY_WORK' || v.kind === 'DAILY_AMPLITUDE';
      const actual = isDaily ? Math.round((v.actual / 60) * 10) / 10 : v.actual;
      const limit = isDaily ? v.limit / 60 : v.limit;
      return {
        ruleId: `statutory:${v.kind.toLowerCase()}`,
        ruleName: STATUTORY_RULE_NAME,
        category: 'CONTRACT_COMPLIANCE',
        message: `Statutory ${v.kind} limit exceeded on ${v.date} (${actual} > ${limit})`,
        messageKey: PlanningService.STATUTORY_MESSAGE_KEY[v.kind],
        messageParams: { date: v.date, actual, limit },
        affectedEmployeeId: employeeId,
        affectedDate: v.date,
        severity: 'blocking',
      };
    }

    private evaluateStaffingMinimum(
  ```
  In `apps/api/src/modules/planning/planning.service.spec.ts`, add: a clinic with zero rules but a shift set that breaches (e.g. an 11h-net day) → `validateShiftsAgainstRules` returns a `hardViolations` entry with `category: 'CONTRACT_COMPLIANCE'`, `ruleId: 'statutory:daily_work'`, `messageKey: 'violations.statutory.dailyWork'`, `severity: 'blocking'`.
  Run: `pnpm --filter @pawly/api test -- planning.service`
  Expected: `Tests:` all passed, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning.service.ts apps/api/src/modules/planning/planning.service.spec.ts && git commit -m "feat(KON-120): emit statutory HARD violations from validateShiftsAgainstRules"`

- [x] **Task 8: Seed the visible statutory rule at onboarding** [AC: 4]
  In `apps/api/src/modules/clinic/clinic.service.ts`, add the import (with the other imports near the top):
  ```ts
  import { STATUTORY_RULE_NAME, STATUTORY_RULE_CONFIG } from '@/modules/planning/french-labor-law';
  ```
  Then inside the `completeOnboarding` `$transaction` callback, insert the seed **after** the `tx.clinicShiftType.createMany({ ... });` call and **before** `return { onboardingCompleted: true };`. Anchor on (currently lines 183–185):
  ```ts
          });
        }

        return { onboardingCompleted: true };
  ```
  Replace with:
  ```ts
          });
        }

        // Story 11-3 — seed the visible French labor-law statutory rule so the admin SEES it
        // in the rules list. Enforcement NEVER depends on this row (it is hard-coded in
        // french-labor-law.ts and applies with zero rules); this is visibility only.
        // Idempotent: skip if a statutory rule already exists for the clinic.
        const existingStatutory = await tx.planningRule.findFirst({
          where: {
            clinicId,
            category: 'CONTRACT_COMPLIANCE',
            name: STATUTORY_RULE_NAME,
          },
          select: { id: true },
        });
        if (!existingStatutory) {
          await tx.planningRule.create({
            data: {
              clinicId,
              name: STATUTORY_RULE_NAME,
              description:
                'Statutory French labor-law limits (10h/day, 13h amplitude, 35h weekly rest, max 6 consecutive days). Enforced by default and cannot be disabled.',
              ruleType: 'HARD',
              category: 'CONTRACT_COMPLIANCE',
              isActive: true,
              priority: 100,
              config: STATUTORY_RULE_CONFIG,
            },
          });
        }

        return { onboardingCompleted: true };
  ```
  In `apps/api/src/modules/clinic/clinic.service.spec.ts`, add: after `completeOnboarding`, the clinic has exactly one `PlanningRule` named `STATUTORY_RULE_NAME` with `ruleType: 'HARD'`; running `completeOnboarding` twice does **not** create a duplicate (idempotent).
  Run: `pnpm --filter @pawly/api test -- clinic.service`
  Expected: `Tests:` all passed, exit 0.
  Commit: `git add apps/api/src/modules/clinic/clinic.service.ts apps/api/src/modules/clinic/clinic.service.spec.ts && git commit -m "feat(KON-120): seed visible statutory rule at onboarding"`

- [x] **Task 9: Localize statutory violations (fr/en) + render hard `messageKey` in the popover** [AC: 3]
  **(a)** In `apps/web/src/i18n/langs/fr.json`, add a `statutory` object under `admin.planningRules.healthBar.violations` (sibling of the existing `rotationEquity` / `contractCompliance` keys):
  ```json
  "statutory": {
    "dailyWork": "Le {date} : {actual}h travaillées, dépasse la limite légale de {limit}h/jour",
    "dailyAmplitude": "Le {date} : amplitude de {actual}h, dépasse la limite légale de {limit}h",
    "weeklyRest": "Semaine du {date} : repos continu de {actual}h, sous le minimum légal de {limit}h",
    "consecutiveDays": "Le {date} : {actual} jours travaillés consécutifs, dépasse le maximum légal de {limit}"
  }
  ```
  **(b)** In `apps/web/src/i18n/langs/en.json`, add the same key under `admin.planningRules.healthBar.violations`:
  ```json
  "statutory": {
    "dailyWork": "{date}: {actual}h worked, exceeds the statutory limit of {limit}h/day",
    "dailyAmplitude": "{date}: {actual}h amplitude, exceeds the statutory limit of {limit}h",
    "weeklyRest": "Week of {date}: {actual}h continuous rest, below the statutory minimum of {limit}h",
    "consecutiveDays": "{date}: {actual} consecutive worked days, exceeds the statutory maximum of {limit}"
  }
  ```
  **(c)** In `apps/web/src/app/[locale]/admin/planning/_components/HealthBarDetailPopover.tsx`, make the HARD violation `<li>` use `messageKey` when present (mirror the soft path). Anchor on (currently line 162):
  ```tsx
                      {localizeMessage(v.message, t)}
  ```
  Replace with:
  ```tsx
                      {localizeMessage(
                        "messageKey" in v && v.messageKey
                          ? t(v.messageKey as Parameters<typeof t>[0], v.messageParams as Record<string, string>)
                          : v.message,
                        t,
                      )}
  ```
  Add/extend a spec (e.g. `apps/web/src/app/[locale]/admin/planning/__tests__/schedule-view.spec.tsx` or a new `HealthBarDetailPopover.spec.tsx`): a hard violation with `messageKey: 'violations.statutory.dailyWork'` + `messageParams` renders the localized string (not the raw English `message`).
  Run: `pnpm --filter @pawly/web test -- HealthBar` (or the schedule-view spec name if you extend that file)
  Expected: `Test Files ... passed`, exit 0.
  Commit: `git add apps/web/src/i18n/langs/fr.json apps/web/src/i18n/langs/en.json "apps/web/src/app/[locale]/admin/planning/_components/HealthBarDetailPopover.tsx" && git commit -m "feat(KON-120): localize statutory hard violations in health bar"`

- [x] **Task 10: Typecheck + full test sweep across affected packages** [AC: 1, 2, 3, 4]
  Run each and confirm green:
  ```bash
  pnpm --filter @pawly/validators exec tsc --noEmit
  pnpm --filter @pawly/validators test -- planning-rule schedule-view
  pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json
  pnpm --filter @pawly/api test -- french-labor-law planning.service planning-generation.service clinic.service
  pnpm --filter @pawly/web exec tsc --noEmit
  pnpm --filter @pawly/web test -- HealthBar
  ```
  Expected: every `tsc --noEmit` exits 0 with no output; every test run reports all passed, exit 0. If the API declaration pass matters for consumers, also run `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.types.json` (see lesson L5).
  Commit: none (verification only). If a fix was needed, fold it into the relevant task's commit.

- [x] **Task 11: Live verification (headed) — statutory limits hold end-to-end** [AC: 1, 2, 3]
  With `pnpm dev` running (web:3020 / API:3001 per the L2-journey memo — confirm the live ports before driving), sign in as the seed admin, repoint to the "Simulation E2E" clinic if needed, and verify the three observable behaviours. Use `mcp__react-grab-mcp__get_element_context` at the GREEN check on the Health Bar (frontend visual verification is mandatory per CLAUDE.md).
  1. **Generation excludes.** Configure a scenario (few employees, dense demand) so the greedy would otherwise assign a 7th consecutive day or an 11h day; regenerate the month; confirm the generator leaves a hole / picks another employee instead of the illegal assignment.
  2. **Health Bar surfaces HARD + publish blocked.** Manually construct (or leave) a statutory breach; open the Planning Health Bar detail popover; confirm a red HARD entry under "Conformité contrat" with the localized statutory message, and that the Publish button is disabled / `publishPlan` returns the 409 "hard violation(s) remain".
  3. **Manual create rejected.** Add a manual shift that pushes an employee's day over 10h; confirm the API rejects it (ConflictException surfaced as a toast).
  Record findings in the Dev Agent Record → Completion Notes. No commit unless a fix is required.

## Dev Notes

### Architecture & data flow
- **Mandatory flow** (unchanged): `Page (RSC) → Client Component → Hook → Zsa → Server Action → tRPC → NestJS Service → Prisma`. This story is almost entirely NestJS-service + validators; the only web change (Task 9) is the Health Bar popover + i18n.
- **Enforcement is hard-coded, not DB-driven.** The four constants in `french-labor-law.ts` are the single source of truth applied on all four surfaces. The seeded `PlanningRule` (Task 8) is **visibility only** — nothing reads its config for enforcement. This is what makes AC4's "hold even with zero configured rules" true.
- **Net-minute accounting invariant** (epic-11-context § 3.4): daily-work and weekly-rest math deduct `breakMinutes` and use UTC/ISO-week arithmetic, consistent with the generation service's `getWeekBounds` (Mon–Sun, UTC) and `calculateShiftMinutes`.
- **Multi-tenancy invariant** (§ 3.1): every new query (`createManualShift` window, `preValidateMove` already-scoped, seed) filters by `clinicId` from `ctx.user`. The statutory module is pure and tenant-agnostic — callers pass already-scoped shifts.
- **Publication gate reuse** (§ 3.5): `publishPlan` already re-derives hard violations via `validateShiftsAgainstRules` (`planning-generation.service.ts:2611-2622`) — **no change needed there**; once Task 7 makes statutory breaches HARD, publication is blocked automatically.

### Non-goals (explicit — keep the 11-8 boundary clean)
- **Do NOT unify the rule engine.** `evaluateContractCompliance` (soft/maxMonthly), `preValidateMove`'s own contract loop, and `scoreAndAssign`'s `hardContractRules` loop stay as they are — each simply *also* calls the shared statutory module. Folding the three divergent evaluators into one HARD/SOFT evaluator is **Story 11-8 (KON-125)**, which this story unblocks.
- **Do NOT make statutory limits admin-configurable.** They are the law — the seeded row's config exists for display; there is no UI in this story to edit/disable it. (Future: a read-only badge; out of scope.)
- **Do NOT add the 11h daily-rest limit (L.3131-1) as a separate check.** The AC lists four limits; 13h daily amplitude is the story's proxy for daily rest within a day. Adding cross-midnight 11h-rest is out of scope.

### Weekly-rest semantics (the one non-obvious algorithm)
"35h continuous weekly rest" is modelled as: for each ISO week (Mon–Sun, UTC) that contains a worked shift, there must exist a continuous rest gap ≥ 35h **overlapping** that week — computed over the employee's full shift timeline so a Saturday-evening → Monday-morning rest that straddles the week boundary is credited (avoids false positives). Unbounded lead/trail rest (no shift before/after in the provided window) counts as satisfied. This is why generation passes a ±8-day window and `validateShiftsAgainstRules` passes the whole range's shifts. **Revised from the step-04 "consecutive-days proxy"** after finding the 30h-in-week counter-example (see the scope-decisions note under Acceptance Criteria); the exact check is cheap here and prevents generation from producing plans that the publish gate would then block.

### File decisions (one responsibility each)
- **`apps/api/src/modules/planning/french-labor-law.ts`** *(NEW)* — statutory constants + pure violation-detection functions (`findStatutoryViolations` post-hoc, `wouldExceedStatutory` incremental) + the seed name/config constants. Imports: none. Exports: constants, types, functions. This is the single source every surface consumes.
- **`planning-generation.service.ts`** *(MOD)* — adds statutory eligibility exclusion in `scoreAndAssign` and pre-write checks in `createManualShift` / `preValidateMove`. Imports `wouldExceedStatutory`, `StatutoryShift`.
- **`planning.service.ts`** *(MOD)* — adds the always-on `evaluateStatutoryLimits` HARD pass to `validateShiftsAgainstRules` + the `statutory:*` → localized `HardViolation` mapper. Imports `findStatutoryViolations`, `STATUTORY_RULE_NAME`, types.
- **`clinic.service.ts`** *(MOD)* — seeds the visible statutory rule inside the `completeOnboarding` transaction, idempotently. Imports `STATUTORY_RULE_NAME`, `STATUTORY_RULE_CONFIG`.
- **`planning-rule.schema.ts`** *(MOD)* — extends `contractComplianceConfigSchema` with the four statutory fields + widened refine (lets the seeded row validate; future-proofs 11-8).
- **`schedule-view.schema.ts`** *(MOD)* — relaxes hard-violation `ruleId` to `z.string()` and adds optional `messageKey`/`messageParams` so statutory (non-DB-rule) violations parse and localize.
- **`HealthBarDetailPopover.tsx` + `fr.json`/`en.json`** *(MOD)* — render hard `messageKey` and provide FR/EN strings.

### Existing code at write time (Step-0 verbatim quotes — re-locate the symbol, numbers may drift)

`planning.service.ts:29-37` (`HardViolation` type, extended in Task 7):
```ts
type HardViolation = {
  ruleId: string;
  ruleName: string;
  category: PlanningRuleCategory;
  message: string;
  affectedEmployeeId?: string;
  affectedDate?: string;
  severity: 'blocking';
};
```

`planning.service.ts:173-193` (`validateShiftsAgainstRules` dispatch tail — Task 7 wires the statutory pass in before the return):
```ts
    for (const rule of rules) {
      const config = rule.config as Record<string, unknown>;

      switch (rule.category) {
        case 'STAFFING_MINIMUM':
          this.evaluateStaffingMinimum(rule, config, validShifts, hardViolations, softViolations);
          break;
        case 'SKILL_REQUIREMENT':
          this.evaluateSkillRequirement(rule, config, validShifts, hardViolations, softViolations);
          break;
        case 'ROTATION_EQUITY':
          this.evaluateRotationEquity(rule, config, validShifts, softViolations, options?.equityCounters);
          break;
        case 'CONTRACT_COMPLIANCE':
          this.evaluateContractCompliance(rule, config, validShifts, softViolations, options?.equityCounters);
          break;
      }
    }

    return { hardViolations, softViolations, rules };
  }
```

`planning-generation.service.ts:975-1031` (`scoreAndAssign` HARD contract loop + the insertion point at Task 5 — the statutory block goes after the `for (const rule of hardContractRules)` loop, before `if (blockedByRotationEquity)`):
```ts
      // HARD CONTRACT_COMPLIANCE — always checked, even if rotation-blocked
      // Per-employee contractHours is always the base; rule maxWeeklyHours is an additional cap
      for (const rule of hardContractRules) {
        const config = rule.config;
        const overtimeTol =
          1 + ((config.overtimeThresholdPercent as number) || 0) / 100;

        const ruleWeekly = config.maxWeeklyHours as number | undefined;
        const effectiveWeeklyLimit = ruleWeekly
          ? Math.min(emp.contractHours, ruleWeekly)
          : emp.contractHours;
        const weekMin = weeklyMinutesMap.get(emp.id) || 0;
        const projectedWeekMin = weekMin + slotMinutes;
        if (projectedWeekMin > effectiveWeeklyLimit * 60 * overtimeTol)
          return false;

        if (config.maxMonthlyHours) {
          const monthMin = employeeMinutes.get(emp.id) || 0;
          const projectedMonthMin = monthMin + slotMinutes;
          const hardLimitMin =
            (config.maxMonthlyHours as number) * 60 * overtimeTol;
          if (projectedMonthMin > hardLimitMin) return false;
        }

        // MIN_REST_HOURS: check minimum rest between consecutive shifts
        const minRest = config.minRestHoursBetweenShifts as number | undefined;
        if (minRest) {
          const minRestMin = minRest * 60;
          // Check previous day: rest = gap from prev shift end to this shift start
          const prevDate = this.getPreviousDate(slot.date);
          const prevShifts = assignmentIndex.get(`${emp.id}|${prevDate}`) || [];
          for (const prev of prevShifts) {
            const rest =
              24 * 60 -
              this.toMinutes(prev.endTime) +
              this.toMinutes(slot.startTime);
            if (rest < minRestMin) return false;
          }
          // Check next day: rest = gap from this shift end to next shift start
          const nextDate = this.getNextDate(slot.date);
          const nextShifts = assignmentIndex.get(`${emp.id}|${nextDate}`) || [];
          for (const next of nextShifts) {
            const rest =
              24 * 60 -
              this.toMinutes(slot.endTime) +
              this.toMinutes(next.startTime);
            if (rest < minRestMin) return false;
          }
        }
      }

      if (blockedByRotationEquity) {
        rotationEquityBlocked.push(emp);
        return false;
      }

      return true;
    });
```
> `AssignedShift` (assignmentIndex value type) is `{ employeeId; date; startTime; endTime; shiftTypeCode; breakMinutes? }` — maps 1:1 to `StatutoryShift`. `assignmentIndex` key = `` `${emp.id}|${date}` ``. Helpers `getPreviousDate`/`getNextDate` return `YYYY-MM-DD` (UTC ±1 day). `slot` carries `date`, `startTime`, `endTime`, `breakMinutes`.

`planning-generation.service.ts:2172-2206` (`createManualShift` overlap loop + create — Task 6a inserts between them):
```ts
    // Check for time overlap on the target employee + date
    const existingShifts = await this.prisma.shift.findMany({
      where: {
        employeeId: input.employeeId,
        clinicId,
        date: new Date(`${input.date}T00:00:00.000Z`),
      },
    });

    for (const existing of existingShifts) {
      if (
        this.timesOverlap(
          shiftType.startTime,
          shiftType.endTime,
          existing.startTime,
          existing.endTime,
        )
      ) {
        throw new ConflictException(
          `Shift overlaps with existing shift (${existing.startTime}-${existing.endTime})`,
        );
      }
    }

    const created = await this.prisma.shift.create({
      data: {
        date: new Date(`${input.date}T00:00:00.000Z`),
        startTime: shiftType.startTime,
        endTime: shiftType.endTime,
        shiftTypeCode: input.shiftTypeCode,
        breakMinutes: shiftType.breakMinutes,
        source: 'MANUAL',
        employeeId: input.employeeId,
        clinicId,
      },
    });
```

`planning-generation.service.ts:2490-2497, 2564-2567` (`preValidateMove` — `monthShifts` window is the source; Task 6b inserts before the final return). `shift` (the moved shift, loaded earlier in the method) carries `startTime`/`endTime`/`breakMinutes`; `hard`/`soft` are `Array<{ rule: string; message: string }>`:
```ts
    // ROTATION_EQUITY check — load monthShifts once before the loop
    const monthShifts = await this.prisma.shift.findMany({
      where: {
        employeeId: input.targetEmployeeId,
        clinicId,
        date: { gte: monthStart, lte: monthEnd },
        id: { not: input.shiftId },
      },
    });
    // (ROTATION_EQUITY loop over `rules` runs here — unchanged; see :2507-2564)
    return { hard, soft };
  }
```

`clinic.service.ts:171-186` (`completeOnboarding` transaction tail — Task 8 inserts the seed before the return):
```ts
        // Delete existing + create shift types
        await tx.clinicShiftType.deleteMany({ where: { clinicId } });
        await tx.clinicShiftType.createMany({
          data: data.shiftTypes.map((st) => ({
            clinicId,
            name: st.name,
            code: st.code,
            startTime: st.startTime,
            endTime: st.endTime,
            breakMinutes: st.breakMinutes ?? 0,
            color: st.color,
          })),
        });

        return { onboardingCompleted: true };
      });
```

`schedule-view.schema.ts:126-136` (hard violation shape — Task 4) and `planning-rule.schema.ts:54-64` (contract-compliance config — Task 3) are quoted verbatim in their respective tasks above.

`HealthBarDetailPopover.tsx:157-166` (hard `<li>` render — Task 9c) and `:185-190` (the soft-path `messageKey` render this mirrors):
```tsx
                {items.map((v, i) => {
                  const name = v.affectedEmployeeId ? empMap.get(v.affectedEmployeeId) : undefined;
                  return (
                    <li key={`${v.ruleId}-${i}`} className="text-xs text-muted-foreground pl-4">
                      {name && <strong className="text-foreground">{name}</strong>}{name && " — "}
                      {localizeMessage(v.message, t)}
                    </li>
                  );
                })}
```
> The soft path already does `"messageKey" in v && v.messageKey ? t(v.messageKey, v.messageParams) : v.message` — Task 9c copies that pattern to the hard path. `t` is scoped to `admin.planningRules.healthBar`, so the messageKey path resolves at `admin.planningRules.healthBar.violations.statutory.*`.

### Testing
- **API**: Jest, `*.spec.ts`, run `pnpm --filter @pawly/api test -- <pattern>`. New: `french-labor-law.spec.ts`. Extended: `planning.service.spec.ts`, `planning-generation.service.spec.ts`, `clinic.service.spec.ts`. Note (epic-11 memo): the generate-path spec mocks share one `shift.findMany` with `loadBorderWeekShifts`/`loadSurvivingShiftsInMonth` — key any new mock on the `where` predicate. The `createManualShift` statutory window adds one more `shift.findMany` (predicate `date: { gte, lte }`) — existing create-manual tests may need their mock keyed on that predicate.
- **Validators**: Vitest, `*.test.ts`, run `pnpm --filter @pawly/validators test -- <pattern>`.
- **Web**: Vitest, `*.spec.ts`, run `pnpm --filter @pawly/web test -- <pattern>`.
- **Typecheck**: rebuild `@pawly/validators` types before the app tsc if the schema change isn't picked up (no path mapping → stale `exports.types`; epic-11 memo). API also has the load-bearing `tsc -p tsconfig.types.json` pass (lesson L5).

### Dependencies
- No new npm packages. `date-fns` is **not** installed in `apps/api` — the statutory module uses native `Date` UTC arithmetic only.
- Consult Context7 for any Prisma transaction / `$transaction` nuance touched in Task 8 (lesson L4). No third-party SDK behaviour changes here.

### Commit prefix
`feat(KON-120): ...` (see per-task commit lines).

## File List

_Files this story creates or modifies (final list confirmed by aped-dev at completion):_

- `apps/api/src/modules/planning/french-labor-law.ts` (new)
- `apps/api/src/modules/planning/french-labor-law.spec.ts` (new)
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`
- `apps/api/src/modules/planning/planning.service.ts`
- `apps/api/src/modules/planning/planning.service.spec.ts`
- `apps/api/src/modules/clinic/clinic.service.ts`
- `apps/api/src/modules/clinic/clinic.service.spec.ts`
- `packages/validators/src/planning/planning-rule.schema.ts`
- `packages/validators/src/planning/planning-rule.schema.test.ts`
- `packages/validators/src/planning/schedule-view.schema.ts`
- `packages/validators/src/planning/schedule-view.schema.test.ts`
- `apps/web/src/app/[locale]/admin/planning/_components/HealthBarDetailPopover.tsx`
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/i18n/langs/en.json`
- web spec: `HealthBarDetailPopover.spec.tsx` (new) or extended `admin/planning/__tests__/schedule-view.spec.tsx`

## Dev Agent Record

- **Model:** claude-opus-4-8[1m]
- **Started:** 2026-07-10
- **Completed:** 2026-07-10

### Summary

The four French statutory limits (10h/day worked, 13h daily amplitude, 35h weekly rest,
max 6 consecutive days) are now a hard-coded, non-disableable floor enforced on all four
surfaces — generation eligibility, manual create/move, always-on Health-Bar validation
(HARD, blocks publication), and a visible seeded onboarding rule — independent of any DB
`PlanningRule`, so a clinic with zero configured rules is protected. All 11 tasks landed
TDD (RED witnessed → GREEN) with one commit per task.

### Files changed

- `apps/api/src/modules/planning/french-labor-law.ts` (new)
- `apps/api/src/modules/planning/french-labor-law.spec.ts` (new)
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`
- `apps/api/src/modules/planning/planning.service.ts`
- `apps/api/src/modules/planning/planning.service.spec.ts`
- `apps/api/src/modules/clinic/clinic.service.ts`
- `apps/api/src/modules/clinic/clinic.service.spec.ts`
- `packages/validators/src/planning/planning-rule.schema.ts`
- `packages/validators/src/planning/planning-rule.schema.test.ts`
- `packages/validators/src/planning/schedule-view.schema.ts`
- `packages/validators/src/planning/schedule-view.schema.test.ts`
- `apps/web/src/app/[locale]/admin/planning/_components/HealthBarDetailPopover.tsx`
- `apps/web/src/app/[locale]/admin/planning/_components/ConflictIndicator.tsx` (live-verification fix)
- `apps/web/src/app/[locale]/admin/planning/_components/ScheduleViewWrapper.tsx` (live-verification fix)
- `apps/web/src/app/[locale]/admin/planning/__tests__/publish.spec.tsx`
- `apps/web/src/app/[locale]/admin/planning/__tests__/schedule-view.spec.tsx` (live-verification fix)
- `apps/web/src/i18n/langs/fr.json`
- `apps/web/src/i18n/langs/en.json`

### Deviations

- **Weekly-rest algorithm corrected against the story's own test (Task 1/2).** The Task 1
  code as written credited *unbounded* lead/trail rest as satisfying the week, which made
  the Task 2 test "flags a week whose only in-week rest is < 35h" fail. AC1 and the locked
  step-04 counter-example both side with the test. Fix: `clampGapLen` clips only the open
  ±BIG sentinel ends to the tested week, so a week worked dense to its last day is flagged
  while a real straddling rest still credits the week it overlaps (the other Dev-Notes
  goal, preserved). All statutory unit tests green.
- **Task 5 second generation test reshaped.** The story's split-shift ">10h/day" case is
  unreachable in generation (a one-shift-per-day guard excludes the employee first), so it
  passed without exercising the statutory check. Replaced with a single 11h-net slot → hole
  (single employee), a genuine RED→GREEN of the statutory exclusion.
- **Task 8 fixture hardened.** Adding the statutory-seed tests surfaced a pre-existing
  `is24_7`-missing type gap in the `onboardingData` test fixture; added `is24_7: false`,
  which also cleared 8 pre-existing `tsc` errors in `clinic.service.spec.ts`.
- **Task 9 web test co-located** in `publish.spec.tsx` (existing `HealthBarDetailPopover`
  describe + popover mock) rather than a new file. React-Grab visual check deferred to the
  live pass (Task 11).
- **Pre-existing `tsc` debt (not this story).** `api tsc -p tsconfig.json` reports 24
  errors, all in `*.spec.ts` (test-mock looseness), none in source, none referencing
  statutory code — down from 32 (Task 8 fixture fix). The load-bearing declaration pass
  `tsconfig.types.json` (lesson L5) is clean (0), and `web tsc` is clean (0).
- **Task 11 scope.** The seed clinic ("Clinique Zen Dev": 1 employee, no shift types, no
  template, starter tier) cannot reach the generation/Health-Bar UI without pro-tier +
  template staging. Enforcement was instead verified **live against the real Neon DB via
  the real Prisma 7 adapter**: a persisted 11h shift → real `findStatutoryViolations`
  returns `DAILY_WORK 660>600` (the Health-Bar/publish HARD source); the real
  `wouldExceedStatutory` on a DB-read window returns `DAILY_AMPLITUDE` for a manual add
  (the `createManualShift` guard). App boots, admin login, and the planning page render
  were confirmed headed. The full staged generation/Health-Bar/manual-toast UI journey is
  recommended for the aped-review L2 journey (project convention for planning stories).
- **Headed live UI pass — two findings surfaced (post-review).**
  1. *Environmental blocker (not this story):* the "Simulation E2E" clinic used for the
     live pass had **no `ClinicConfig` row**, so `getScheduleViewForMonth` threw
     `NotFoundException` from the unguarded `getOperationalConfig` call → tRPC 500 → the
     whole schedule grid fell back to the empty state. Seeding a `ClinicConfig` unblocked
     the grid; no product code was at fault (statutory eval is downstream and
     `.catch()`-guarded).
  2. *Localization gap (fixed here, RED→GREEN):* the **cell-level `ConflictIndicator`**
     popover rendered statutory HARD violations with the raw English API `message`
     ("Statutory DAILY_WORK limit exceeded…") while the UI was French — the `messageKey`
     localization added for the Health-Bar popover in Task 9 was never wired to the grid
     cell. Fix mirrors `WarningBadge`: `ScheduleViewWrapper`'s hard-conflict map now
     carries `messageKey`/`messageParams`; `ConflictIndicator` resolves them via
     `useTranslations('admin')`; and an `admin.violations.statutory.*` block was added to
     `fr.json`/`en.json` (the cell root, alongside the existing Health-Bar root). New test
     `schedule-view.spec.tsx › "localizes hard conflicts via messageKey instead of the raw
     message"`.
  3. *Date format (fixed here, RED→GREEN):* statutory `messageParams.date` was ISO
     (`2026-07-13`); the human-facing date is now French `DD/MM/YYYY` via a pure
     `formatFrDate` helper in `statutoryToHardViolation` (no `date-fns` in the API).
     **`affectedDate` deliberately stays ISO** — it keys the grid-cell conflict lookup
     (`${employeeId}|${day.date}`), so formatting it would break the badge placement.
     Extended the Task-8 statutory HARD test to assert `messageParams.date === '03/08/2026'`
     with `affectedDate === '2026-08-03'`. Verified live: the LUN. 13 badge popover now
     reads **"Le 13/07/2026 : 11h travaillées, dépasse la limite légale de 10h/jour"**.

### Test output

Fresh, this session:

```
# Statutory module (Task 1/2)
pnpm --filter @pawly/api test -- french-labor-law      → Tests: 14 passed, 14 total
# Validators (Task 3/4)
pnpm --filter @pawly/validators test -- planning-rule schedule-view → Tests 129 passed (129)
# Full API suite (regression)
pnpm --filter @pawly/api test                          → Test Suites: 33 passed; Tests: 891 passed
# Full web suite (regression)
pnpm --filter @pawly/web test                          → Test Files 50 passed; Tests 751 passed
# Typecheck
pnpm --filter @pawly/validators exec tsc --noEmit                  → 0 errors
pnpm --filter @pawly/web exec tsc --noEmit                         → 0 errors
pnpm --filter @pawly/api  exec tsc --noEmit -p tsconfig.types.json → 0 errors (L5 declaration pass)

# Live real-DB verification (Prisma 7 adapter → Neon)
AC3  findStatutoryViolations(persisted 11h) → [{kind:DAILY_WORK, actual:660, limit:600}]
AC2  wouldExceedStatutory(DB window, 19:30-21:30 add) → ["DAILY_AMPLITUDE"]

# Headed live UI pass (post-review localization fix)
pnpm --filter @pawly/web test -- schedule-view.spec.tsx   → 68 passed (incl. new messageKey test)
pnpm --filter @pawly/web test -- publish integration-i18n → 72 passed (no regression)
Live: LUN.13 cell conflict popover renders FR → "Le 2026-07-13 : 11h travaillées, dépasse la limite légale de 10h/jour"
```
