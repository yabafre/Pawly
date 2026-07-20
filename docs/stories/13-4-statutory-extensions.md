# Story: 13-4-statutory-extensions — Statutory Extensions: Daily Rest, Weekly Ceiling, Mandatory Break

**Epic:** Epic 13 — Planning Integrity & Solver Fidelity
**Status:** ready-for-dev
**Branch:** feature/KON-136-13-4-statutory-extensions
**Ticket:** KON-136 (Linear · project Pawly · blocked-by KON-134 [done] · blocks KON-138)
**Origin:** Audit findings **T9** (11h daily rest absent — the header conflates it with 13h amplitude) + **T10** (no 48h statutory ceiling; break deducted but never required), 2026-07-14, triage 2026-07-16 (`docs/triage-decision.md`, MEDIUM → reclassified FEATURE). T9 was **explicitly descoped by Story 11-3** ("13h amplitude is the story's proxy") — this story revisits that decision deliberately; it is not a bug fix.

> **Read first:** `docs/epics-context/epic-13-context.md` — §3 invariant **4** (statutory rules are non-disableable: hard-coded constants, evaluated unconditionally; config can only tighten, never loosen), invariant **5** (net vs gross: daily 10h compares NET minutes; amplitude/weekly-rest use raw busy intervals), invariant **8** (UTC everywhere, `HH:MM` minute arithmetic, DST-immune). §4 anchor map for 13-4: `french-labor-law.ts:11,24`, `rule-engine.ts:298-301`, `minRestHoursBetweenShifts` proxy `:1196-1221`, `breakMinutes` deducted (`shiftNetMinutes`) but never required.
>
> **Scope decisions (locked with Alex at story time):**
> 1. **Daily rest = every inter-block gap ≥ 11h.** After merging an employee's busy intervals, *any* gap between two consecutive intervals under 11h is a `DAILY_REST` breach — including an intra-day split (e.g. 09:00–12:00 + 14:00–18:00). Alex chose the stricter reading over "cross-midnight gaps only". Consequence: an employee cannot hold two separate shift blocks less than 11h apart; combined with the 13h amplitude cap this effectively forbids same-day split shifts. Documented, intentional.
> 2. **Mandatory break is BLOCKING everywhere + a shift-type garde-fou.** AC-3 mandates blocking in generation, manual edits and publish. A shift type configured with > 6h net worked and < 20 min break becomes ungeneratable/unmovable — legally correct. To prevent an admin creating such a type, a zod `.refine` rejects it at shift-type creation (both onboarding and settings share the schema), and the onboarding step surfaces the error. Settings' `ShiftTypeFormSheet` client error-surface stays deferred (consistent with 13-3's deferral) — the server still rejects.
> 3. **Net worked (break deducted)** for both the 48h ceiling and the "> 6h" break threshold — consistent with `shiftNetMinutes` / `rule-engine.netMinutes`. Effective working time in the Code du travail is net of breaks.
> 4. **`rule-engine.ts` is NOT touched.** The 48h ceiling is statutory and unconditional (invariant 4) — a config cap would be disableable. It lives in `french-labor-law.ts` and therefore automatically wins over any `maxWeeklyHours` × tolerance (AC-2). The `rule-engine.ts:298-301` anchor identifies *where the gap is*, not where the fix goes.
>
> **The leverage (13-1/13-2 payoff):** every write path already routes statutory enforcement through **two pure functions** — `wouldExceedStatutory` (incremental: generation eligibility `:1426`, `createManualShift` `:2787`, `move-validation.ts:330`) and `findStatutoryViolations` (post-hoc: publish/Health-Bar `planning.service.ts:300`). Extending those two functions wires the three new limits into **every** surface. No new call sites, no wiring code — only the pure evaluators, the message table, i18n, the seeded-config visibility, and the garde-fou.

## User Story

**As a** clinic operating under French labor law, **I want** daily rest, the absolute weekly ceiling, and the mandatory break enforced by default, **so that** a legal roster is guaranteed beyond the four Epic 11 statutory limits.

## Acceptance Criteria

1. **Given** an employee whose merged busy intervals leave a gap under 11 consecutive hours between two work blocks (L.3131-1) — across midnight or within a day — **When** the engine evaluates a generation candidate, a manual create, or a manual move, or the publish gate re-validates the month, **Then** a `DAILY_REST` statutory HARD violation is raised (incremental paths block the write; publish surfaces it on the Health Bar), computed on `mergedBusyIntervals` and cross-midnight aware.
2. **Given** an employee whose ISO week would exceed 48h **net** worked (L.3121-20), **When** any of the same paths evaluate it, **Then** a `WEEKLY_CEILING` HARD violation is raised **regardless of admin configuration** — the statutory ceiling wins over `maxWeeklyHours` × tolerance, and `rule-engine.ts` is unchanged.
3. **Given** a day with more than 6h **net** worked and a cumulative `breakMinutes` under 20 (L.3121-16), **When** generation, a manual edit, or publish evaluates it, **Then** a `MANDATORY_BREAK` HARD (blocking) violation is raised.
4. **Given** a clinic with zero configured planning rules, **When** any statutory path runs, **Then** the three new limits still apply (hard-coded in `french-labor-law.ts`, non-disableable); **and** the onboarding-seeded "French labor-law limits" rule lists them for visibility (`STATUTORY_RULE_CONFIG` + description + editable schema keys); **and** they are covered by unit + generation tests.
5. **Given** an admin defining a shift type in onboarding or in settings whose net worked time (`end − start` with overnight wrap, minus break) exceeds 6h with a break under 20 min, **When** they submit, **Then** the shift type is rejected by the shared zod schema (both paths); **and** the onboarding step surfaces a localized error; **and** an in-bounds shift type (≤ 6h net, or ≥ 20 min break) is still accepted.

## Tasks

> **Build/test order (Dev Notes § Testing):** validator changes (`@pawly/validators`) must be rebuilt (`pnpm --filter @pawly/validators build`) **before** the API tsc/Jest pass — `@pawly/api` imports the compiled dist, no path mapping (memory `epic11-dev-gotchas`, lesson L5). API tests: `pnpm --filter @pawly/api test -- <pattern>` (Jest; root `pnpm test` is broken by the rtk shim). Web/validators: `pnpm --filter @pawly/{web,validators} test -- <pattern>` (Vitest).

---

- [ ] **Task 1 — Constants, kinds, seeded config, header** (`french-labor-law.ts`) [AC: 1, 2, 3, 4]

  In `apps/api/src/modules/planning/french-labor-law.ts`, replace the module header (lines 1–19) legal-refs block and the `FRENCH_LABOR_LAW` / `STATUTORY_RULE_CONFIG` / `StatutoryViolationKind` declarations with the versions below.

  Header legal-refs block (replace the `Legal refs:` list, lines 9–13):
  ```ts
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
  ```

  Replace `FRENCH_LABOR_LAW` (lines 23–32):
  ```ts
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
  ```

  Replace `STATUTORY_RULE_CONFIG` (lines 36–41) — add the three visibility-only keys (names deliberately DO NOT collide with `maxWeeklyHours`/`maxMonthlyHours`, which `rule-engine.ts` reads):
  ```ts
  export const STATUTORY_RULE_CONFIG = {
    maxDailyHours: FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES / 60,
    maxDailyAmplitudeHours: FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES / 60,
    minDailyRestHours: FRENCH_LABOR_LAW.MIN_DAILY_REST_MINUTES / 60,
    maxWeeklyStatutoryHours: FRENCH_LABOR_LAW.MAX_WEEKLY_WORK_MINUTES / 60,
    minBreakMinutesOver6h: FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H,
    minWeeklyRestHours: FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS,
    maxConsecutiveWorkDays: FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS,
  } as const;
  ```

  Replace `StatutoryViolationKind` (lines 43–47):
  ```ts
  export type StatutoryViolationKind =
    | 'DAILY_WORK'
    | 'DAILY_AMPLITUDE'
    | 'DAILY_REST'
    | 'WEEKLY_CEILING'
    | 'MANDATORY_BREAK'
    | 'WEEKLY_REST'
    | 'CONSECUTIVE_DAYS';
  ```

  Run: `pnpm --filter @pawly/api test -- french-labor-law`
  Expected: still green (no behavioural change yet); this is a compile-safe scaffold step. `Tests: N passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/french-labor-law.ts && git commit -m "feat(KON-136): add 11h rest / 48h ceiling / 20min break statutory constants"`

---

- [ ] **Task 2 — RED: unit specs for the three new limits** (`french-labor-law.spec.ts`) [AC: 1, 2, 3]

  Append the block below to `apps/api/src/modules/planning/french-labor-law.spec.ts` (inside the top-level `describe`, after the existing tests). It fails now because the evaluators do not yet emit the new kinds — that IS the RED.

  ```ts
  describe('Story 13-4 (KON-136) — statutory extensions', () => {
    const day = (
      date: string,
      startTime: string,
      endTime: string,
      breakMinutes = 0,
    ): StatutoryShift => ({ date, startTime, endTime, breakMinutes });

    describe('DAILY_REST (11h, L.3131-1)', () => {
      it('findStatutoryViolations flags a cross-midnight gap under 11h', () => {
        const shifts = [
          day('2026-03-02', '14:00', '22:00'), // ends Mon 22:00
          day('2026-03-03', '06:00', '14:00'), // starts Tue 06:00 -> 8h rest
        ];
        const kinds = findStatutoryViolations(shifts).map((v) => v.kind);
        expect(kinds).toContain('DAILY_REST');
      });

      it('flags an intra-day split under 11h (Alex: stricter reading)', () => {
        const shifts = [
          day('2026-03-02', '09:00', '12:00'),
          day('2026-03-02', '14:00', '18:00'), // 2h gap
        ];
        expect(
          findStatutoryViolations(shifts).some((v) => v.kind === 'DAILY_REST'),
        ).toBe(true);
      });

      it('does not flag a gap of exactly 11h', () => {
        const shifts = [
          day('2026-03-02', '10:00', '19:00'), // ends 19:00
          day('2026-03-03', '06:00', '10:00'), // starts +11h
        ];
        expect(
          findStatutoryViolations(shifts).some((v) => v.kind === 'DAILY_REST'),
        ).toBe(false);
      });

      it('wouldExceedStatutory returns DAILY_REST only when the candidate introduces it', () => {
        const windowShifts = [day('2026-03-02', '14:00', '22:00')];
        const candidate = day('2026-03-03', '06:00', '14:00');
        expect(wouldExceedStatutory(windowShifts, candidate)).toContain(
          'DAILY_REST',
        );
        // A candidate 12h later introduces nothing.
        expect(
          wouldExceedStatutory(windowShifts, day('2026-03-03', '10:00', '18:00')),
        ).not.toContain('DAILY_REST');
      });
    });

    describe('WEEKLY_CEILING (48h net, L.3121-20)', () => {
      const fifty = () =>
        // Mon–Sat 2026-03-02..07, 10h gross - 1h break = 9h net = 54h/week
        ['02', '03', '04', '05', '06', '07'].map((d) =>
          day(`2026-03-${d}`, '08:00', '19:00', 60),
        );

      it('findStatutoryViolations flags an ISO week over 48h net', () => {
        const v = findStatutoryViolations(fifty()).find(
          (x) => x.kind === 'WEEKLY_CEILING',
        );
        expect(v).toBeDefined();
        expect(v!.date).toBe('2026-03-02'); // ISO-week Monday
        expect(v!.actual).toBe(6 * 9 * 60); // 3240 net minutes
      });

      it('wouldExceedStatutory flags the candidate that crosses 48h net', () => {
        const windowShifts = ['02', '03', '04', '05', '06'].map((d) =>
          day(`2026-03-${d}`, '08:00', '19:00', 60),
        ); // 5 * 9h = 45h
        expect(
          wouldExceedStatutory(windowShifts, day('2026-03-07', '08:00', '19:00', 60)),
        ).toContain('WEEKLY_CEILING'); // 54h
      });
    });

    describe('MANDATORY_BREAK (20min over 6h, L.3121-16)', () => {
      it('flags a > 6h net day with under 20min break', () => {
        const shifts = [day('2026-03-02', '08:00', '15:00', 0)]; // 7h net, 0 break
        const v = findStatutoryViolations(shifts).find(
          (x) => x.kind === 'MANDATORY_BREAK',
        );
        expect(v).toBeDefined();
        expect(v!.actual).toBe(0);
        expect(v!.limit).toBe(20);
      });

      it('does not flag a > 6h day with a 20min break', () => {
        const shifts = [day('2026-03-02', '08:00', '15:20', 20)]; // ~7h net, 20 break
        expect(
          findStatutoryViolations(shifts).some((v) => v.kind === 'MANDATORY_BREAK'),
        ).toBe(false);
      });

      it('does not flag a <= 6h day', () => {
        const shifts = [day('2026-03-02', '08:00', '14:00', 0)]; // 6h net exactly
        expect(
          findStatutoryViolations(shifts).some((v) => v.kind === 'MANDATORY_BREAK'),
        ).toBe(false);
      });

      it('wouldExceedStatutory flags the candidate that tips the day over 6h without a break', () => {
        const windowShifts = [day('2026-03-02', '08:00', '12:00', 0)]; // 4h
        expect(
          wouldExceedStatutory(windowShifts, day('2026-03-02', '13:00', '16:30', 0)),
        ).toEqual(expect.arrayContaining(['MANDATORY_BREAK'])); // day now 7h30 net, 0 break
      });
    });
  });
  ```

  Run: `pnpm --filter @pawly/api test -- french-labor-law`
  Expected: RED — new `describe('Story 13-4 …')` assertions fail (`DAILY_REST`/`WEEKLY_CEILING`/`MANDATORY_BREAK` not emitted). Existing tests stay green.
  Commit: `git add apps/api/src/modules/planning/french-labor-law.spec.ts && git commit -m "test(KON-136): RED specs for 11h rest / 48h ceiling / 20min break"`

---

- [ ] **Task 3 — GREEN: post-hoc evaluator** (`findStatutoryViolations`) [AC: 1, 2, 3]

  In `french-labor-law.ts`, add the `epochMinuteToDate` helper right after `shiftEpoch` (around line 84):
  ```ts
  function epochMinuteToDate(absMinutes: number): string {
    return addDays(EPOCH, Math.floor(absMinutes / MIN_PER_DAY));
  }
  ```

  Inside `findStatutoryViolations`, in the existing `for (const [date, dayShifts] of byDay)` loop, add the mandatory-break check right after the `DAILY_AMPLITUDE` push (after line 287). `worked` (net) is already computed at the top of the loop:
  ```ts
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
  ```

  Still inside `findStatutoryViolations`, add the daily-rest scan and the weekly-ceiling scan just before the final `return out;` (after the WEEKLY_REST block, line 339):
  ```ts
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
  ```

  Run: `pnpm --filter @pawly/api test -- french-labor-law`
  Expected: the `findStatutoryViolations` arms of the Story 13-4 describe now pass; `wouldExceedStatutory` arms may still be RED (Task 4). Existing tests green.
  Commit: `git add apps/api/src/modules/planning/french-labor-law.ts && git commit -m "feat(KON-136): post-hoc daily-rest, weekly-ceiling, mandatory-break checks"`

---

- [ ] **Task 4 — GREEN: incremental evaluator** (`wouldExceedStatutory`) [AC: 1, 2, 3]

  In `french-labor-law.ts`, add the two helpers just above `wouldExceedStatutory` (before line 354):
  ```ts
  /** True if any gap between consecutive merged busy intervals is under 11h. */
  function hasDailyRestDeficit(shifts: StatutoryShift[]): boolean {
    const busy = mergedBusyIntervals(shifts);
    for (let i = 0; i < busy.length - 1; i++) {
      if (busy[i + 1][0] - busy[i][1] < FRENCH_LABOR_LAW.MIN_DAILY_REST_MINUTES)
        return true;
    }
    return false;
  }

  /** Net worked minutes of the ISO week containing `date`, across `shifts`. */
  function weekWorkedMinutes(shifts: StatutoryShift[], date: string): number {
    const wk = isoWeekStart(date);
    return shifts
      .filter((s) => isoWeekStart(s.date) === wk)
      .reduce((sum, s) => sum + shiftNetMinutes(s), 0);
  }
  ```

  Inside `wouldExceedStatutory`, the `dayBefore` / `dayAfter` arrays are already computed for the daily checks (lines 366–367). Add the mandatory-break check right after the `DAILY_AMPLITUDE` push (after line 381):
  ```ts
    // Mandatory break (L.3121-16) — candidate's day: > 6h net worked with < 20min break.
    const breakBefore = dayBefore.reduce((s, x) => s + (x.breakMinutes ?? 0), 0);
    const breakAfter = dayAfter.reduce((s, x) => s + (x.breakMinutes ?? 0), 0);
    const breachAfter =
      dayWorkedMinutes(dayAfter) > FRENCH_LABOR_LAW.BREAK_REQUIRED_AFTER_MINUTES &&
      breakAfter < FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H;
    const breachBefore =
      dayWorkedMinutes(dayBefore) > FRENCH_LABOR_LAW.BREAK_REQUIRED_AFTER_MINUTES &&
      breakBefore < FRENCH_LABOR_LAW.MIN_BREAK_MINUTES_OVER_6H;
    if (breachAfter && !breachBefore) kinds.push('MANDATORY_BREAK');
  ```

  Then add the daily-rest and weekly-ceiling checks just before the final `return kinds;` (after the WEEKLY_REST block, line 401):
  ```ts
    // Daily rest (L.3131-1) — introduced-by-candidate over the merged busy set.
    if (hasDailyRestDeficit(withCandidate) && !hasDailyRestDeficit(windowShifts))
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
  ```

  Run: `pnpm --filter @pawly/api test -- french-labor-law`
  Expected: all Story 13-4 assertions pass. `Tests: N passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/french-labor-law.ts && git commit -m "feat(KON-136): incremental daily-rest, weekly-ceiling, mandatory-break checks"`

---

- [ ] **Task 5 — Message keys, unit conversion, publish range** (`planning.service.ts`) [AC: 1, 2, 3, 4]

  In `apps/api/src/modules/planning/planning.service.ts`, replace the `STATUTORY_MESSAGE_KEY` record (lines 265–273) — the `Record<StatutoryViolationKind, string>` type forces all seven kinds or the file will not compile:
  ```ts
    private static readonly STATUTORY_MESSAGE_KEY: Record<
      StatutoryViolationKind,
      string
    > = {
      DAILY_WORK: 'violations.statutory.dailyWork',
      DAILY_AMPLITUDE: 'violations.statutory.dailyAmplitude',
      DAILY_REST: 'violations.statutory.dailyRest',
      WEEKLY_CEILING: 'violations.statutory.weeklyCeiling',
      MANDATORY_BREAK: 'violations.statutory.mandatoryBreak',
      WEEKLY_REST: 'violations.statutory.weeklyRest',
      CONSECUTIVE_DAYS: 'violations.statutory.consecutiveDays',
    };
  ```

  Replace the `WEEKLY_REST` branch of `violationInPublishedRange` (lines 319–324) so the weekly ceiling is kept on ISO-week intersection too:
  ```ts
      if (v.kind === 'WEEKLY_REST' || v.kind === 'WEEKLY_CEILING') {
        const d = new Date(`${v.date}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + 6);
        const weekEnd = d.toISOString().split('T')[0];
        return v.date <= range.end && weekEnd >= range.start;
      }
  ```

  Replace the unit-conversion head of `statutoryToHardViolation` (lines 338–340) — DAILY_REST and WEEKLY_CEILING are stored in minutes and display as hours; MANDATORY_BREAK stays in minutes:
  ```ts
      const MINUTE_KINDS: ReadonlySet<StatutoryViolationKind> = new Set([
        'DAILY_WORK',
        'DAILY_AMPLITUDE',
        'DAILY_REST',
        'WEEKLY_CEILING',
      ]);
      const inMinutes = MINUTE_KINDS.has(v.kind);
      const actual = inMinutes ? Math.round((v.actual / 60) * 10) / 10 : v.actual;
      const limit = inMinutes ? v.limit / 60 : v.limit;
  ```

  Run: `pnpm --filter @pawly/api test -- planning.service`
  Expected: existing statutory tests stay green (new kinds are additive). `Tests: N passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning.service.ts && git commit -m "feat(KON-136): wire new statutory kinds into publish messages + range filter"`

---

- [ ] **Task 6 — Publish/Health-Bar coverage for the new kinds** (`planning.service.spec.ts`) [AC: 1, 2, 3]

  Append to `apps/api/src/modules/planning/planning.service.spec.ts` a test that drives `validateShiftsAgainstRules` (or the existing statutory harness in that file — reuse the same setup the existing `violations.statutory.dailyWork` test uses) with an employee whose loaded month shows: (a) a Sat→Mon 8h gap → `DAILY_REST`; (b) a 54h ISO week → `WEEKLY_CEILING`; (c) a 7h/0-break day → `MANDATORY_BREAK`. Assert each produces a `hardViolations` entry with the right `messageKey` and that a `WEEKLY_CEILING` whose week only intersects the published range at the boundary is kept.

  ```ts
  describe('Story 13-4 (KON-136) — statutory extensions surface on publish', () => {
    it('emits dailyRest / weeklyCeiling / mandatoryBreak hard violations with messageKeys', async () => {
      // Reuse the file's existing statutory fixture builder; the exact harness name
      // is in the neighbouring 'violations.statutory.dailyWork' test above.
      const { hardViolations } = await runStatutoryFixture([
        // Sat 22:00 -> Mon 06:00 is a > 24h gap (rest OK); use a Mon->Tue 8h gap instead:
        { date: '2026-03-02', startTime: '14:00', endTime: '22:00', breakMinutes: 0 },
        { date: '2026-03-03', startTime: '06:00', endTime: '15:00', breakMinutes: 0 },
      ]);
      const keys = hardViolations.map((v) => v.messageKey);
      expect(keys).toContain('violations.statutory.dailyRest'); // 8h gap
      expect(keys).toContain('violations.statutory.mandatoryBreak'); // Tue 9h/0-break
    });
  });
  ```

  > **Dev note for this task:** open the file first and reuse its existing statutory-fixture helper and Prisma mock shape (the placeholder `runStatutoryFixture` above stands in for it). Match the `reportRange` so the violations fall inside it. If the file has no reusable helper, mirror the setup of the nearest existing `evaluateStatutoryLimits`/`validateShiftsAgainstRules` test verbatim.

  Run: `pnpm --filter @pawly/api test -- planning.service`
  Expected: `Tests: N passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning.service.spec.ts && git commit -m "test(KON-136): publish surfaces daily-rest / weekly-ceiling / mandatory-break"`

---

- [ ] **Task 7 — Seeded-rule visibility: config schema + description** (`planning-rule.schema.ts`, `clinic.service.ts`) [AC: 4]

  In `packages/validators/src/planning/planning-rule.schema.ts`, add the three visibility-only optional keys to `contractComplianceConfigSchema` (after line 62, inside the `.object({...})`):
  ```ts
      minDailyRestHours: z.number().min(1).max(24).optional(),
      maxWeeklyStatutoryHours: z.number().min(1).max(168).optional(),
      minBreakMinutesOver6h: z.number().int().min(0).max(120).optional(),
  ```

  Extend the `.refine` OR-list (lines 65–72) so a config carrying only the new keys still validates:
  ```ts
    .refine(
      (data) =>
        data.maxWeeklyHours !== undefined ||
        data.maxMonthlyHours !== undefined ||
        data.minRestHoursBetweenShifts !== undefined ||
        data.maxDailyHours !== undefined ||
        data.maxDailyAmplitudeHours !== undefined ||
        data.minWeeklyRestHours !== undefined ||
        data.maxConsecutiveWorkDays !== undefined ||
        data.minDailyRestHours !== undefined ||
        data.maxWeeklyStatutoryHours !== undefined ||
        data.minBreakMinutesOver6h !== undefined,
      'At least one constraint (hour limit, rest hours, or statutory limit) must be defined'
    );
  ```

  In `apps/api/src/modules/clinic/clinic.service.ts`, replace the seeded-rule `description` string (lines 206–207) so the admin sees all seven limits:
  ```ts
                'Statutory French labor-law limits (10h/day, 13h amplitude, 11h daily rest, 48h weekly ceiling, 20min break over 6h, 35h weekly rest, max 6 consecutive days). Enforced by default and cannot be disabled.',
  ```

  Rebuild the validators dist (API imports it), then run both suites:
  Run: `pnpm --filter @pawly/validators build && pnpm --filter @pawly/validators test -- planning-rule && pnpm --filter @pawly/api test -- clinic.service`
  Expected: validators build exits 0; `planning-rule.schema.test` green; `clinic.service` green. `Tests: N passed`.
  Commit: `git add packages/validators/src/planning/planning-rule.schema.ts apps/api/src/modules/clinic/clinic.service.ts && git commit -m "feat(KON-136): surface new statutory limits in the seeded rule config"`

---

- [ ] **Task 8 — Assert the seeded config carries the new keys** (`clinic.service.spec.ts`) [AC: 4]

  In `apps/api/src/modules/clinic/clinic.service.spec.ts`, extend the existing test `seeds the visible French labor-law statutory rule as a HARD rule` (around line 717) to assert the created rule's `config` includes the three new keys. Add these assertions to that test's `planningRule.create` expectation (match the object it already asserts):
  ```ts
      expect(createArg.data.config).toEqual(
        expect.objectContaining({
          minDailyRestHours: 11,
          maxWeeklyStatutoryHours: 48,
          minBreakMinutesOver6h: 20,
        }),
      );
  ```

  > **Dev note:** the local variable name for the captured create args (`createArg` above) must match what the existing test uses — read the test first; it may already destructure `mockTx.planningRule.create.mock.calls`. Reuse that reference rather than adding a new spy.

  Run: `pnpm --filter @pawly/api test -- clinic.service`
  Expected: `Tests: N passed`, exit 0.
  Commit: `git add apps/api/src/modules/clinic/clinic.service.spec.ts && git commit -m "test(KON-136): seeded statutory rule config exposes the three new limits"`

---

- [ ] **Task 9 — Shift-type garde-fou: shared break rule** (`onboarding.schema.ts`, `shift-type.schema.ts`) [AC: 5]

  In `packages/validators/src/clinic/onboarding.schema.ts`, add the shared predicate and constants just above `shiftTypeSchema` (before line 67):
  ```ts
  // L.3121-16 (Story 13-4) — a shift with > 6h NET worked (gross - break, overnight-wrap
  // aware) requires at least a 20-min break. Shared by every shift-type create path so an
  // admin cannot persist a type that generation/manual writes would then always reject.
  export const MANDATORY_BREAK_MINUTES = 20;
  export const BREAK_REQUIRED_AFTER_NET_MINUTES = 360;

  export function shiftBreakRuleOk(data: {
    startTime: string;
    endTime: string;
    breakMinutes?: number;
  }): boolean {
    const [sh, sm] = data.startTime.split(':').map(Number);
    const [eh, em] = data.endTime.split(':').map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return true; // let the regex guard report format errors
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    const gross = end >= start ? end - start : 1440 - start + end;
    const net = gross - (data.breakMinutes ?? 0);
    return (
      net <= BREAK_REQUIRED_AFTER_NET_MINUTES ||
      (data.breakMinutes ?? 0) >= MANDATORY_BREAK_MINUTES
    );
  }
  ```

  Replace `shiftTypeSchema` (lines 67–70) to chain the break refine after the existing start≠end refine:
  ```ts
  export const shiftTypeSchema = shiftTypeFieldsSchema
    .refine((data) => data.endTime !== data.startTime, {
      message: 'Start and end times must differ',
      path: ['endTime'],
    })
    .refine(shiftBreakRuleOk, {
      message: 'A shift over 6h worked requires at least a 20-minute break',
      path: ['breakMinutes'],
    });
  ```

  In `packages/validators/src/clinic/shift-type.schema.ts`, update the imports (line 2) and replace `createShiftTypeSchema` (lines 4–7) and the `updateShiftTypeSchema` refine (lines 24–32):
  ```ts
  import {
    shiftTypeFieldsSchema,
    timeRegex,
    shiftBreakRuleOk,
  } from './onboarding.schema';

  export const createShiftTypeSchema = shiftTypeFieldsSchema
    .refine((data) => data.endTime !== data.startTime, {
      message: 'Start and end times must differ',
      path: ['endTime'],
    })
    .refine(shiftBreakRuleOk, {
      message: 'A shift over 6h worked requires at least a 20-minute break',
      path: ['breakMinutes'],
    });
  ```
  ```ts
  export const updateShiftTypeSchema = updateShiftTypeFieldsSchema.refine(
    (data) => {
      if (data.startTime && data.endTime) {
        if (data.endTime === data.startTime) return false;
        // Only enforce the break rule when all three fields are present in the patch.
        if (data.breakMinutes !== undefined) {
          return shiftBreakRuleOk({
            startTime: data.startTime,
            endTime: data.endTime,
            breakMinutes: data.breakMinutes,
          });
        }
      }
      return true;
    },
    { message: 'Start and end times must differ, and a shift over 6h needs a 20-min break', path: ['endTime'] }
  );
  ```

  Add unit coverage in `packages/validators/src/clinic/shift-type.schema.test.ts` (create the file if absent — check first; the neighbouring test is `onboarding.schema.test.ts`):
  ```ts
  import { describe, it, expect } from 'vitest';
  import { createShiftTypeSchema } from './shift-type.schema';

  describe('createShiftTypeSchema break garde-fou (Story 13-4, KON-136)', () => {
    const base = { name: 'Day', code: 'DAY', color: '#4F46E5' };

    it('rejects a > 6h net shift with under 20min break', () => {
      const r = createShiftTypeSchema.safeParse({
        ...base,
        startTime: '08:00',
        endTime: '15:00',
        breakMinutes: 0,
      });
      expect(r.success).toBe(false);
    });

    it('accepts a > 6h net shift with a 20min break', () => {
      const r = createShiftTypeSchema.safeParse({
        ...base,
        startTime: '08:00',
        endTime: '15:20',
        breakMinutes: 20,
      });
      expect(r.success).toBe(true);
    });

    it('accepts a <= 6h net shift with no break', () => {
      const r = createShiftTypeSchema.safeParse({
        ...base,
        startTime: '08:00',
        endTime: '14:00',
        breakMinutes: 0,
      });
      expect(r.success).toBe(true);
    });
  });
  ```

  Run: `pnpm --filter @pawly/validators test -- shift-type onboarding.schema`
  Expected: `Test Files … passed`, exit 0. Then rebuild for downstream: `pnpm --filter @pawly/validators build` (exit 0).
  Commit: `git add packages/validators/src/clinic/onboarding.schema.ts packages/validators/src/clinic/shift-type.schema.ts packages/validators/src/clinic/shift-type.schema.test.ts && git commit -m "feat(KON-136): reject shift types over 6h without a 20-min break"`

---

- [ ] **Task 10 — Onboarding UX surface + safe default** (`StepShiftTypes.tsx`, i18n) [AC: 5]

  In `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx`, extend the `shiftTypes` field `onChange` validator (after the existing `if (hasIncomplete) return t('incompleteShiftType');`, line 50) to surface the break rule client-side, and bump the "add shift type" default break so the default 08:30–18:30 (10h) block is legal by default:

  Add, right after the `hasIncomplete` block:
  ```ts
            const hasBreakViolation = value.some((st) => {
              const [sh, sm] = String(st.startTime).split(':').map(Number);
              const [eh, em] = String(st.endTime).split(':').map(Number);
              if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
              const start = sh * 60 + sm;
              const end = eh * 60 + em;
              const gross = end >= start ? end - start : 1440 - start + end;
              const net = gross - (st.breakMinutes ?? 0);
              return net > 360 && (st.breakMinutes ?? 0) < 20;
            });
            if (hasBreakViolation) return t('breakRequiredOver6h');
  ```

  In the "add shift type" button handler (line 195), change `breakMinutes: 0,` to `breakMinutes: 30,`.

  > **Dev note:** also open `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx` and confirm the INITIAL `shiftTypes` default(s) satisfy the rule (≤ 6h net, or ≥ 20 min break). If an initial default is > 6h net with < 20 min break, bump its `breakMinutes` to 30 so a fresh onboarding is not blocked before the admin edits anything.

  Add the translation key `breakRequiredOver6h` under `onboarding.steps.shiftTypes` in BOTH `apps/web/src/i18n/langs/fr.json` and `apps/web/src/i18n/langs/en.json` (locate the block via `grep -n '"shiftTypes"' apps/web/src/i18n/langs/fr.json` — it holds `incompleteShiftType`):
  - FR: `"breakRequiredOver6h": "Un poste de plus de 6h travaillées nécessite une pause d'au moins 20 minutes."`
  - EN: `"breakRequiredOver6h": "A shift over 6h worked requires at least a 20-minute break."`

  Run: `pnpm --filter @pawly/web test -- StepShiftTypes onboarding`
  Expected: existing web tests green; if the file has no test, this run reports `no test found` for the pattern — that is acceptable for this task, the visual check below is the gate. Then **visual verification** (frontend GREEN gate, CLAUDE.md): with `pnpm dev` running, open the onboarding shift-types step, add a 10h shift with 0 break, and confirm the localized error renders; use `mcp__react-grab-mcp__get_element_context` on the shift-types step to capture the error state.
  Commit: `git add apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx apps/web/src/i18n/langs/fr.json apps/web/src/i18n/langs/en.json && git commit -m "feat(KON-136): onboarding surfaces the 20-min break rule + safe default"`

---

- [ ] **Task 11 — Statutory i18n strings for the three new kinds** (`fr.json`, `en.json`) [AC: 1, 2, 3, 4]

  Both locale files carry the `violations.statutory` block **twice** (nested under the planning namespace ~line 342, and top-level `violations` ~line 726). Add the three keys to **all four** blocks, after `consecutiveDays`.

  `apps/web/src/i18n/langs/en.json` (both blocks):
  ```json
            "dailyRest": "{date}: {actual}h rest before this shift, below the statutory minimum of {limit}h",
            "weeklyCeiling": "Week of {date}: {actual}h worked, exceeds the absolute statutory ceiling of {limit}h/week",
            "mandatoryBreak": "{date}: {actual}min break for over 6h worked, below the statutory minimum of {limit}min"
  ```

  `apps/web/src/i18n/langs/fr.json` (both blocks):
  ```json
            "dailyRest": "Le {date} : {actual}h de repos avant ce poste, sous le minimum légal de {limit}h",
            "weeklyCeiling": "Semaine du {date} : {actual}h travaillées, dépasse le plafond légal absolu de {limit}h/semaine",
            "mandatoryBreak": "Le {date} : pause de {actual}min pour plus de 6h travaillées, sous le minimum légal de {limit}min"
  ```

  > **Dev note:** add a comma after the existing `consecutiveDays` line in each block, and do NOT add a trailing comma after `mandatoryBreak`. Validate JSON after editing.

  Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/src/i18n/langs/fr.json','utf8')); JSON.parse(require('fs').readFileSync('apps/web/src/i18n/langs/en.json','utf8')); console.log('JSON OK')"`
  Expected: `JSON OK`. Then `pnpm --filter @pawly/web test -- publish schedule-view` — existing statutory-render tests stay green.
  Commit: `git add apps/web/src/i18n/langs/fr.json apps/web/src/i18n/langs/en.json && git commit -m "feat(KON-136): FR/EN strings for daily-rest, weekly-ceiling, mandatory-break"`

---

- [ ] **Task 12 — Generation-level proof (AC-4)** (`planning-generation.service.spec.ts`) [AC: 1, 2, 3, 4]

  Append a test to `apps/api/src/modules/planning/planning-generation.service.spec.ts` proving a generation candidate that would breach a NEW statutory limit is excluded, with **zero** configured planning rules (invariant 4 — the seeded rule is visibility-only; enforcement is hard-coded). Reuse the file's existing generation harness; key the `shift.findMany` mock on the `where` predicate shape (`date.gte`+`date.lte` = the ±8-day statutory window, `date.in` = border, `OR` = survivors — memory `generation-test-assignments-mock`, and 13-2's Dev Notes). Assert the employee holding an adjacent shift that leaves < 11h rest is NOT assigned the conflicting slot.

  ```ts
  it('Story 13-4 (KON-136): excludes a candidate that would break 11h daily rest, zero rules', async () => {
    // Employee already worked 2026-03-02 14:00–22:00; the 2026-03-03 06:00 slot leaves 8h rest.
    // With NO planning rules configured, the hard-coded statutory net must still exclude it.
    // (Wire the statutory-window findMany load to return the 2026-03-02 shift; assert the
    // generated assignments do not contain emp on the 2026-03-03 early slot.)
    const result = await generateForFixture(/* … reuse harness; see neighbouring tests */);
    const early = result.assignments.find(
      (a) => a.date === '2026-03-03' && a.employeeId === 'emp-rest' && a.startTime === '06:00',
    );
    expect(early).toBeUndefined();
  });
  ```

  > **Dev note:** the placeholder `generateForFixture` stands in for the file's real harness — open the file, copy the nearest `generatePlan`/eligibility test's setup verbatim, and use the predicate-routed `shift.findMany` mock (never call-order). `result.assignments` derives from `createManyAndReturn` — echo the persisted `data`, do not `mockResolvedValue([])` (memory `generation-test-assignments-mock`). Run the FULL generation suite, not just the new case.

  Run: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: `Tests: N passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-136): generation excludes candidates breaching new statutory limits"`

---

- [ ] **Task 13 — Full-suite regression gate** [AC: 1, 2, 3, 4, 5]

  Rebuild the validators dist, then run the affected suites end to end to prove no regression (byte-identical greedy default, invariant 6; existing statutory tests, publish, move-validation, generation).

  Run:
  ```bash
  pnpm --filter @pawly/validators build
  pnpm --filter @pawly/validators test -- planning-rule shift-type onboarding.schema
  pnpm --filter @pawly/api test -- french-labor-law planning.service planning-generation.service move-validation clinic.service
  pnpm --filter @pawly/web test -- publish schedule-view StepShiftTypes
  ```
  Expected: every command exits 0. Note the API test count moved up by the added cases (baseline 825, memory `Test Counts`).
  Commit: `git commit --allow-empty -m "test(KON-136): full statutory-extension regression green"`

## Dev Notes

- **Architecture — the two-function leverage.** All statutory enforcement is already centralized. You extend the pure evaluators; the surfaces inherit the new limits for free:
  - `wouldExceedStatutory(windowShifts, candidate)` (incremental, introduced-by-candidate) ← generation eligibility (`planning-generation.service.ts:1426`), `createManualShift` (`:2787`), `move-validation.ts:330`.
  - `findStatutoryViolations(shifts, window?)` (post-hoc, every breach) ← publish/Health-Bar (`planning.service.ts:300`, filtered by `violationInPublishedRange`).
  - **Do NOT touch `rule-engine.ts`.** The 48h ceiling is statutory/unconditional (invariant 4); a config cap would be disableable. This is why AC-2 "wins over `maxWeeklyHours` × tolerance" holds automatically.
- **Net vs gross (invariant 5).** `shiftNetMinutes` / `dayWorkedMinutes` already deduct breaks; use them for the 48h ceiling and the > 6h break threshold. Amplitude stays raw. The mandatory-break `actual` is the break taken (minutes), not net.
- **Unit conventions in `StatutoryViolation`.** DAILY_REST, WEEKLY_CEILING store **minutes** in `actual`/`limit` (→ divided by 60 for display in `statutoryToHardViolation` via `MINUTE_KINDS`); MANDATORY_BREAK stores **minutes** and displays as minutes; WEEKLY_REST stays hours; CONSECUTIVE_DAYS stays days. Attribution: DAILY_REST → resume day; WEEKLY_CEILING → ISO-week Monday (publish filter treats it like WEEKLY_REST); MANDATORY_BREAK → offending day.
- **Compile-time guard.** `STATUTORY_MESSAGE_KEY: Record<StatutoryViolationKind, string>` will not compile until all three new keys are added (Task 5). This is intentional — it prevents a silently unlabelled violation.
- **Build/test order (lesson L5, memory `epic11-dev-gotchas`).** `@pawly/api` and `@pawly/web` import the compiled `@pawly/validators` dist (no path mapping). After Tasks 7 & 9 (validator edits), run `pnpm --filter @pawly/validators build` before the API tsc/Jest pass, or you'll type-check against stale exports.
- **Generation mock discipline (memory `generation-test-assignments-mock`).** In `planning-generation.service.spec.ts`, `shift.findMany` is shared across survivors (`where.OR`), border (`where.date.in`), and the ±8-day statutory window (`where.date.gte`+`date.lte`). Route by predicate, never call order. `result.assignments` derives from `createManyAndReturn` — echo the persisted `data`; `mockResolvedValue([])` makes assignment assertions vacuous.
- **Frontend visual verification (CLAUDE.md).** Task 10 touches onboarding UI → at GREEN, drive the shift-types step and capture the error state with `mcp__react-grab-mcp__get_element_context`.

### Existing code at write time (Step-0 quotes — verify before editing; line numbers drift)

`apps/api/src/modules/planning/french-labor-law.ts:23-32` (current `FRENCH_LABOR_LAW`, four limits):
```ts
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
```

`french-labor-law.ts:43-47` (current `StatutoryViolationKind`, four kinds):
```ts
export type StatutoryViolationKind =
  | 'DAILY_WORK'
  | 'DAILY_AMPLITUDE'
  | 'WEEKLY_REST'
  | 'CONSECUTIVE_DAYS';
```

`french-labor-law.ts:36-41` (current `STATUTORY_RULE_CONFIG`):
```ts
export const STATUTORY_RULE_CONFIG = {
  maxDailyHours: FRENCH_LABOR_LAW.MAX_DAILY_WORK_MINUTES / 60,
  maxDailyAmplitudeHours: FRENCH_LABOR_LAW.MAX_DAILY_AMPLITUDE_MINUTES / 60,
  minWeeklyRestHours: FRENCH_LABOR_LAW.MIN_WEEKLY_REST_HOURS,
  maxConsecutiveWorkDays: FRENCH_LABOR_LAW.MAX_CONSECUTIVE_WORK_DAYS,
} as const;
```

`french-labor-law.ts:269-288` (current `findStatutoryViolations` per-day loop — you ADD MANDATORY_BREAK after the amplitude push; `worked` is net):
```ts
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
```

`french-labor-law.ts:365-381` (current `wouldExceedStatutory` daily block — `dayBefore`/`dayAfter` are reused for MANDATORY_BREAK):
```ts
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
```

`apps/api/src/modules/planning/planning.service.ts:265-273` (current `STATUTORY_MESSAGE_KEY` — the `Record` type forces all seven):
```ts
  private static readonly STATUTORY_MESSAGE_KEY: Record<StatutoryViolationKind, string> = {
    DAILY_WORK: 'violations.statutory.dailyWork',
    DAILY_AMPLITUDE: 'violations.statutory.dailyAmplitude',
    WEEKLY_REST: 'violations.statutory.weeklyRest',
    CONSECUTIVE_DAYS: 'violations.statutory.consecutiveDays',
  };
```

`planning.service.ts:319-324` (current `violationInPublishedRange` weekly branch) and `:338-340` (unit conversion):
```ts
    if (v.kind === 'WEEKLY_REST') {
      const d = new Date(`${v.date}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 6);
      const weekEnd = d.toISOString().split('T')[0];
      return v.date <= range.end && weekEnd >= range.start;
    }
```
```ts
    const isDaily = v.kind === 'DAILY_WORK' || v.kind === 'DAILY_AMPLITUDE';
    const actual = isDaily ? Math.round((v.actual / 60) * 10) / 10 : v.actual;
    const limit = isDaily ? v.limit / 60 : v.limit;
```

`packages/validators/src/planning/planning-rule.schema.ts:50-74` (current `contractComplianceConfigSchema` — statutory keys already documented as visibility-only):
```ts
export const contractComplianceConfigSchema = z
  .object({
    maxWeeklyHours: z.number().int().min(1).optional(),
    maxMonthlyHours: z.number().int().min(1).optional(),
    overtimeThresholdPercent: z.number().min(0).max(100).optional(),
    minRestHoursBetweenShifts: z.number().min(1).max(24).optional(),
    maxDailyHours: z.number().min(1).max(24).optional(),
    maxDailyAmplitudeHours: z.number().min(1).max(24).optional(),
    minWeeklyRestHours: z.number().min(24).max(168).optional(),
    maxConsecutiveWorkDays: z.number().int().min(1).max(7).optional(),
  })
  .refine(/* OR-list of the keys above */);
```

`packages/validators/src/clinic/onboarding.schema.ts:67-70` (current `shiftTypeSchema`) and `shift-type.schema.ts:4-7,24-32` (current create/update):
```ts
export const shiftTypeSchema = shiftTypeFieldsSchema.refine(
  (data) => data.endTime !== data.startTime,
  { message: 'Start and end times must differ', path: ['endTime'] }
);
```
```ts
export const createShiftTypeSchema = shiftTypeFieldsSchema.refine(
  (data) => data.endTime !== data.startTime,
  { message: 'Start and end times must differ', path: ['endTime'] }
);
```

`apps/api/src/modules/clinic/clinic.service.ts:206-207` (current seeded-rule description):
```ts
              'Statutory French labor-law limits (10h/day, 13h amplitude, 35h weekly rest, max 6 consecutive days). Enforced by default and cannot be disabled.',
```

### File-decision map

| File (repo-relative) | Single responsibility | Inputs → Outputs |
|---|---|---|
| `apps/api/src/modules/planning/french-labor-law.ts` | Hard-coded statutory limits + the two pure evaluators | ← `shift-interval.ts`; → `FRENCH_LABOR_LAW`, `StatutoryViolationKind`, `findStatutoryViolations`, `wouldExceedStatutory`, `STATUTORY_RULE_CONFIG` |
| `apps/api/src/modules/planning/french-labor-law.spec.ts` | Unit proof of all seven limits (both functions) | ← evaluators; → Jest cases |
| `apps/api/src/modules/planning/planning.service.ts` | Post-hoc statutory → `HardViolation` mapping (message key, unit, publish range) | ← `findStatutoryViolations`, `StatutoryViolationKind`; → `hardViolations[]` |
| `apps/api/src/modules/planning/planning.service.spec.ts` | Publish/Health-Bar coverage for new kinds | ← service; → Jest cases |
| `apps/api/src/modules/clinic/clinic.service.ts` | Seed the visible statutory rule (description only) | ← `STATUTORY_RULE_CONFIG`, `STATUTORY_RULE_NAME`; → seeded `PlanningRule` |
| `apps/api/src/modules/clinic/clinic.service.spec.ts` | Assert seeded config exposes new keys | ← seed; → Jest cases |
| `packages/validators/src/planning/planning-rule.schema.ts` | Editable statutory config keys (visibility) | → `contractComplianceConfigSchema` |
| `packages/validators/src/clinic/onboarding.schema.ts` | Shared shift-type break rule + onboarding shift-type schema | → `shiftBreakRuleOk`, `shiftTypeSchema` |
| `packages/validators/src/clinic/shift-type.schema.ts` | Settings create/update shift-type schemas (break garde-fou) | ← `shiftBreakRuleOk`; → `createShiftTypeSchema`, `updateShiftTypeSchema` |
| `packages/validators/src/clinic/shift-type.schema.test.ts` | Unit proof of the break garde-fou | ← schema; → Vitest cases |
| `apps/web/.../onboarding/_components/steps/StepShiftTypes.tsx` | Client-side break error + safe default | ← form; → localized error |
| `apps/web/src/i18n/langs/{fr,en}.json` | Statutory + onboarding strings (FR/EN) | → i18n keys |
| `apps/api/src/modules/planning/planning-generation.service.spec.ts` | Generation-level proof (zero rules, AC-4) | ← service; → Jest case |

- **Testing:** Jest `*.spec.ts` for API (`pnpm --filter @pawly/api test -- <pattern>`); Vitest for web/validators (`pnpm --filter @pawly/{web,validators} test -- <pattern>`); root `pnpm test` is broken by the rtk shim. Rebuild `@pawly/validators` dist before the API pass on any validator edit.
- **Dependencies:** none new. Pure TS + zod (`@pawly/zod`), existing `shift-interval.ts` primitive (13-3), existing i18n (next-intl).

### Out of scope (deferred, documented)

- IDCC 1875 specifics (night/Sunday/holiday premiums, part-time thresholds, 12-week 44h average) — `.aped/.out-of-scope/2026-07-16-perimetre-idcc-1875.md`.
- Under-18 regime (no age field) — `.aped/.out-of-scope/2026-07-16-mineurs-droit-travail.md`.
- Settings `ShiftTypeFormSheet` client-side error surface (server zod still rejects) — consistent with 13-3's UX deferral.
- Property-based invariants over the extended statutory set — Story 13-8 (KON-138, blocked-by this story).

## File List

- `apps/api/src/modules/planning/french-labor-law.ts` (modify)
- `apps/api/src/modules/planning/french-labor-law.spec.ts` (modify)
- `apps/api/src/modules/planning/planning.service.ts` (modify)
- `apps/api/src/modules/planning/planning.service.spec.ts` (modify)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` (modify)
- `apps/api/src/modules/clinic/clinic.service.ts` (modify)
- `apps/api/src/modules/clinic/clinic.service.spec.ts` (modify)
- `packages/validators/src/planning/planning-rule.schema.ts` (modify)
- `packages/validators/src/clinic/onboarding.schema.ts` (modify)
- `packages/validators/src/clinic/shift-type.schema.ts` (modify)
- `packages/validators/src/clinic/shift-type.schema.test.ts` (new or modify — check)
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx` (modify)
- `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx` (verify/modify — initial default break)
- `apps/web/src/i18n/langs/fr.json` (modify)
- `apps/web/src/i18n/langs/en.json` (modify)

## Dev Agent Record

- **Model:** _(set by aped-dev at implementation)_
- **Started:** _(set by aped-dev)_
- **Completed:** _(set by aped-dev)_

### Summary

_(aped-dev fills at completion.)_

### Files changed

_(aped-dev fills at completion.)_

### Deviations

_(aped-dev fills at completion.)_

### Test output

_(aped-dev fills at completion.)_
