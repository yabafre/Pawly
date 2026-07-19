# Story: 13-2-unified-validation-windows — Unified Cross-Month Validation Windows

**Epic:** Epic 13 — Planning Integrity & Solver Fidelity
**Status:** ready-for-dev
**Branch:** feature/KON-134-13-2-unified-validation-windows
**Ticket:** KON-134 (Linear · project Pawly · milestone Epic 13 · High · blocked-by KON-131 / 13-1 [done] · blocks KON-136 / 13-4)
**Origin:** Multi-agent planning audit 2026-07-14, finding **T4** (triage `docs/triage-decision.md`): *"Fenêtres de validation incohérentes : move/publish = mois strict, génération = semaine ISO border ; `clampGapLen` crédite du repos fantôme. Référence correcte : `createManualShift` ±8 j réels."* Wave W2 — extends the `move-validation.ts` window knob that 13-1 introduced.

> **Read first:** `docs/epics-context/epic-13-context.md` — audit synthesis, file:line anchors (§4), and the cross-cutting invariants every Epic 13 story MUST preserve (§3). `aped-dev` / `aped-review` load it automatically. **Line numbers below were re-verified against THIS worktree during authoring** (`planning-generation.service.ts` = 5017 lines, `planning.service.ts` = 724, `french-labor-law.ts` = 362). They drift on every merge — **re-locate the symbol, never trust the number blindly.**

## User Story

**As a** clinic operating under French labor law, **I want** every validation path to see the same cross-month data window, **so that** consecutive-day runs and 35h weekly-rest deficits cannot hide at a month frontier.

## Acceptance Criteria

_These map 1:1 onto ticket KON-134's AC-1…AC-3, which remain the authority._

1. **AC1 — One window, every path.** **Given** shifts spanning a month boundary, **When** move validation, publish validation (`validateShiftsAgainstRules`), or generation/replay eligibility runs, **Then** each path evaluates the statutory limits against the **±8-real-days** cross-month window (all shift sources) that `createManualShift` already uses — **no path validates on the strict month anymore.**
2. **AC2 — No phantom rest at a window edge.** **Given** a rest gap bounded by the edge of the loaded data window (a `restGaps` head/tail sentinel), **When** `clampGapLen` scores it for the weekly-rest check, **Then** it is credited only up to the rest actually **proven inside the loaded ±8-day window** — never clipped to the ISO-week boundary — so a 35h deficit straddling a month frontier is no longer masked.
3. **AC3 — Straddling breaches are caught on every path.** **Given** a 7th consecutive worked day or a missing 35h rest straddling a month frontier — including the Dec→Jan ISO-week boundary — **When** each path runs, **Then** the breach is detected, unit-tested **per path** (move, publish, generation).

**FRs covered:** FR5 (draft generation highlighting holes), FR7 (Hard Rules block conflicting shifts). **NFRs:** NFR3 (zero silent failures — a month-frontier breach is surfaced, never silently accepted).

> **Mechanism map (AC → surface, realized in Tasks):**
> AC1 → publish loads a ±8-real-day statutory set in `validateShiftsAgainstRules` (Task 3); generation loads `loadStatutoryBorderShifts` into `assignmentIndex` (Task 5); move/create already load ±8 real days (13-1, unchanged — guarded by Task 7's test). AC2 → `clampGapLen` bounds sentinels to the real data window in `french-labor-law.ts` (Task 1). AC3 → one unit test per path: `french-labor-law.spec.ts` (Task 2), `planning.service.spec.ts` (Task 4), `planning-generation.service.spec.ts` (Task 6), `move-validation.spec.ts` (Task 7).

> **Scope decisions locked with Alex during authoring (GATE step-04):**
> - **The move arm of T4 is already shipped by 13-1.** `moveShift` / `preValidateMove` (via `loadMoveValidationInputs`, `planning-generation.service.ts:2851-2854`) and `createManualShift` (`:2703-2713`) already load the ±8-real-day `statutoryWindowShifts`; `evaluateMoveViolations` already calls `wouldExceedStatutory` on it (`move-validation.ts:328-338`). **13-2 does NOT rewrite the move path** — it (a) fixes the two paths that still validate narrow (publish, generation), (b) fixes `clampGapLen`'s phantom-rest bug that all paths shared, and (c) proves the move path with a straddle test (Task 7). No new move code.
> - **`clampGapLen` semantics = clip sentinels to the real data window, NOT exclude them.** A pure "exclude every sentinel from credit" reading of AC2 introduces a false positive: an employee with no shift in the ±8 days before their first shift of the month (return from leave, new hire) has a genuine ≥35h rest that would be flagged as a deficit and would block publishing. Instead, a head/tail sentinel is credited up to the loaded window edge (`win.lo` / `win.hi`) — a genuine ≥8-day rest still counts (the window spans >35h each side), while rest beyond the loaded window is never credited. This is the correctness-preserving fix and the one Alex approved.
> - **Publish widens the statutory window ONLY, and filters what it reports.** `validateShiftsAgainstRules` keeps `validShifts` on the strict month for staffing / skill / rotation / contract / monthly-cap (widening those would double-count monthly caps and mis-count per-day staffing). A **separate** ±8-day set feeds the statutory checks, and reported violations are filtered to the published range so a breach living purely in an adjacent month cannot block this month's publish. Filter rule: `DAILY_*` / `CONSECUTIVE_DAYS` keep iff the offending day ∈ `[startDate, endDate]`; `WEEKLY_REST` keeps iff its ISO week `[date, date+6d]` **intersects** `[startDate, endDate]` (a Dec-29→Jan-4 week is relevant to a January publish).
> - **Generation loads a statutory-only context that never touches the fill/equity counters.** `loadStatutoryBorderShifts` seeds ONLY `assignmentIndex` (which `evaluateEligibility`'s ±8-day statutory window reads) — never `dayOfWeekCounts`, `weeklyMinutesCounter`, or `allShiftsForScoring`. Polluting those would change rotation/equity decisions and break the byte-identical-greedy invariant (11-10 / epic-13 context §3.6). It uses a `date: { gte, lte }` predicate — distinct from `loadBorderWeekShifts` (`date.in`) and `loadSurvivingShiftsInMonth` (`OR`) — so mocks and the generator can tell the three loads apart.

## Tasks

- [x] **Task 1: Bound weekly-rest credit to the real data window in `french-labor-law.ts`** [AC: 2, 3]
  In `apps/api/src/modules/planning/french-labor-law.ts`, replace the four symbols below **verbatim**. `clampGapLen` gains an optional `win` (absolute-minute data-window bounds); `weekHasRestDeficit` and `findStatutoryViolations` thread it; `wouldExceedStatutory` derives it from `candidate ± 8 days` (the exact window every incremental caller loads). When `win` is absent the legacy week-clip is kept, so any caller that does not pass a window is unchanged.

  Replace `clampGapLen` (currently `:201-205`):
  ```ts
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
  ```

  Replace `weekHasRestDeficit` (currently `:209-224`):
  ```ts
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
  ```

  Replace `findStatutoryViolations` (currently `:230-305`) — the daily + consecutive blocks are byte-identical; only the signature, the `win` derivation, and the two `clampGapLen` calls in the weekly-rest block change:
  ```ts
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
        !overlapping.some(([gs, ge]) => clampGapLen(gs, ge, lo, hi, win) >= restMin)
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

    return out;
  }
  ```

  Replace `wouldExceedStatutory` (currently `:316-362`) — daily + consecutive blocks are byte-identical; only the `win` derivation and the two `weekHasRestDeficit` calls change:
  ```ts
  /**
   * INCREMENTAL check — which statutory limits adding `candidate` would breach for an
   * employee who already holds `windowShifts` (same employee). Only breaches INTRODUCED by
   * the candidate are returned, so it never blocks an assignment that cannot make things
   * worse. Used to reject a single generation candidate / manual create / manual move.
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
  ```
  Run: `pnpm --filter @pawly/api test -- french-labor-law`
  Expected: `Test Suites: 1 passed`, all existing `french-labor-law` tests still green (the `window`-less calls keep legacy behaviour), exit 0.
  Commit: `git add apps/api/src/modules/planning/french-labor-law.ts && git commit -m "feat(KON-134): bound weekly-rest credit to the loaded data window (T4 phantom rest)"`

- [x] **Task 2: Prove the window-bounded weekly-rest fix in `french-labor-law.spec.ts`** [AC: 2, 3]
  Append this describe block to `apps/api/src/modules/planning/french-labor-law.spec.ts` (it reuses the file's existing `shift` helper). All times `09:00-18:00` = 9h net (under the 10h daily cap) so only weekly-rest / consecutive-day violations arise.
  ```ts
  describe('Story 13-2 — window-bounded weekly rest', () => {
    // ISO week Mon 2026-08-03 .. Sun 2026-08-09. Dense Wed–Sun, worked 09:00-18:00.
    const denseWedToSun = ['05', '06', '07', '08', '09'].map((d) =>
      shift(`2026-08-${d}`, '09:00', '18:00', 0),
    );

    it('does NOT credit phantom rest when the data window is exactly the loaded range', () => {
      // Window = the loaded days only. The head sentinel cannot be proven as 35h rest,
      // so the week is (conservatively) flagged — no phantom credit at the edge.
      const v = findStatutoryViolations(denseWedToSun, {
        start: '2026-08-05',
        end: '2026-08-09',
      });
      expect(v).toContainEqual(
        expect.objectContaining({ kind: 'WEEKLY_REST', date: '2026-08-03' }),
      );
    });

    it('DOES credit a genuine >=8-day rest proven inside a wide window (no false positive)', () => {
      // Same dense Wed–Sun work, but the window spans 8 real days on each side and no shift
      // exists before Wed — the proven long rest before the first shift is credited.
      const v = findStatutoryViolations(denseWedToSun, {
        start: '2026-07-28',
        end: '2026-08-16',
      });
      expect(v.filter((x) => x.kind === 'WEEKLY_REST')).toHaveLength(0);
    });

    it('flags a 35h weekly-rest deficit on the ISO week straddling Dec→Jan', () => {
      // Three dense weeks 09:00-18:00 across the year boundary: no 35h rest overlaps the
      // middle ISO week (Mon 2025-12-29 .. Sun 2026-01-04).
      const days: string[] = [];
      for (let d = 22; d <= 31; d++)
        days.push(`2025-12-${String(d).padStart(2, '0')}`);
      for (let d = 1; d <= 11; d++)
        days.push(`2026-01-${String(d).padStart(2, '0')}`);
      const dense = days.map((d) => shift(d, '09:00', '18:00', 0));
      const v = findStatutoryViolations(dense, {
        start: '2025-12-15',
        end: '2026-01-18',
      });
      expect(v).toContainEqual(
        expect.objectContaining({ kind: 'WEEKLY_REST', date: '2025-12-29' }),
      );
    });

    it('flags the 7th consecutive worked day straddling Dec→Jan (incremental)', () => {
      const priorRun = [
        '2025-12-27',
        '2025-12-28',
        '2025-12-29',
        '2025-12-30',
        '2025-12-31',
        '2026-01-01',
      ].map((d) => shift(d, '09:00', '15:00', 0));
      expect(
        wouldExceedStatutory(priorRun, shift('2026-01-02', '09:00', '15:00', 0)),
      ).toContain('CONSECUTIVE_DAYS');
    });
  });
  ```
  Run: `pnpm --filter @pawly/api test -- french-labor-law`
  Expected: `Tests:` count rises by 4, all passing; the two straddle cases and `does NOT credit phantom rest` would fail against the pre-Task-1 `clampGapLen`. exit 0.
  Commit: `git add apps/api/src/modules/planning/french-labor-law.spec.ts && git commit -m "test(KON-134): window-bounded weekly rest + Dec→Jan straddle"`

- [x] **Task 3: Widen the publish/health-bar statutory window in `planning.service.ts`** [AC: 1, 3]
  In `apps/api/src/modules/planning/planning.service.ts`:

  **(a)** Update the `french-labor-law` import (currently `:28-34`) to add `StatutoryViolation` (already imported as a type — confirm it is present; it is used by `statutoryToHardViolation`).

  **(b)** In `validateShiftsAgainstRules`, replace the single statutory call (currently `:241-243`):
  ```ts
      // Story 11-3 — statutory French labor-law HARD limits, ALWAYS enforced (independent of
      // configured rules). Surfaces in the Planning Health Bar and blocks publication.
      this.evaluateStatutoryLimits(validShifts, hardViolations);
  ```
  with a **separate ±8-real-day statutory load** and a range-filtered evaluation (Story 13-2):
  ```ts
      // Story 13-2 (KON-134) — statutory checks (35h weekly rest, consecutive days) span
      // month frontiers, so they run on a +/-8-real-day window around [startDate, endDate],
      // NOT the strict month `validShifts` uses. Only breaches attributable to the published
      // range are reported (a breach living purely in an adjacent month must not block this
      // month's publish).
      const statWindowStart = new Date(startDate);
      statWindowStart.setUTCDate(statWindowStart.getUTCDate() - 8);
      const statWindowEnd = new Date(endDate);
      statWindowEnd.setUTCDate(statWindowEnd.getUTCDate() + 8);
      const statutoryShifts = await this.prisma.shift.findMany({
        where: { clinicId, date: { gte: statWindowStart, lte: statWindowEnd } },
        include: { employee: { select: { id: true } } },
      });
      const toIso = (d: Date) => d.toISOString().split('T')[0];
      this.evaluateStatutoryLimits(
        statutoryShifts.filter((s) => s.shiftTypeCode),
        hardViolations,
        { start: toIso(startDate), end: toIso(endDate) },
        { start: toIso(statWindowStart), end: toIso(statWindowEnd) },
      );
  ```

  **(c)** Replace `evaluateStatutoryLimits` (currently `:258-285`) with the range-filtering version + its helper:
  ```ts
    private evaluateStatutoryLimits(
      shifts: Array<{
        date: Date;
        startTime: string;
        endTime: string;
        breakMinutes: number;
        employee: { id: string };
      }>,
      hardViolations: HardViolation[],
      reportRange: { start: string; end: string },
      window: { start: string; end: string },
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
        for (const v of findStatutoryViolations(empShifts, window)) {
          if (!PlanningService.violationInPublishedRange(v, reportRange)) continue;
          hardViolations.push(this.statutoryToHardViolation(v, employeeId));
        }
      }
    }

    /**
     * Story 13-2 (KON-134) — keep only statutory violations attributable to the published
     * range. DAILY_* / CONSECUTIVE_DAYS are attributed to the offending day; WEEKLY_REST to
     * its ISO-week Monday, so it is kept when that week intersects the range (a Dec-29→Jan-4
     * week straddling the frontier is relevant to a January publish). ISO `YYYY-MM-DD`
     * strings compare chronologically as lexicographic strings.
     */
    private static violationInPublishedRange(
      v: StatutoryViolation,
      range: { start: string; end: string },
    ): boolean {
      if (v.kind === 'WEEKLY_REST') {
        const d = new Date(`${v.date}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + 6);
        const weekEnd = d.toISOString().split('T')[0];
        return v.date <= range.end && weekEnd >= range.start;
      }
      return v.date >= range.start && v.date <= range.end;
    }
  ```
  Run: `pnpm --filter @pawly/api test -- planning.service`
  Expected: existing `PlanningService` tests still green (the statutory `shift.findMany` now runs a second query; the default mock `shift.findMany.mockResolvedValue([])` covers it → no statutory violations, unchanged). exit 0.
  Commit: `git add apps/api/src/modules/planning/planning.service.ts && git commit -m "feat(KON-134): publish/health-bar statutory checks span a ±8-day cross-month window"`

- [x] **Task 4: Prove the publish window + range filter in `planning.service.spec.ts`** [AC: 1, 3]
  Append this describe block to `apps/api/src/modules/planning/planning.service.spec.ts`. It uses the file's existing `mockPrismaService` / `service` / `clinicId`. The two `shift.findMany` calls in `validateShiftsAgainstRules` resolve in order: first the strict-month `validShifts`, then the ±8-day statutory set — so `mockResolvedValueOnce` twice keys them.
  ```ts
  describe('Story 13-2 — cross-month statutory window (validateShiftsAgainstRules)', () => {
    const mkStatShift = (
      employeeId: string,
      date: string,
      startTime: string,
      endTime: string,
    ) => ({
      employeeId,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime,
      endTime,
      breakMinutes: 0,
      shiftTypeCode: 'SURGERY',
      employee: { id: employeeId },
    });

    beforeEach(() => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([]); // no configured rules
    });

    it('detects a 35h weekly-rest deficit straddling the month frontier', async () => {
      mockPrismaService.shift.findMany.mockResolvedValueOnce([]); // strict-month validShifts
      const dense: ReturnType<typeof mkStatShift>[] = [];
      for (let d = 22; d <= 31; d++)
        dense.push(mkStatShift('e1', `2025-12-${d}`, '09:00', '18:00'));
      for (let d = 1; d <= 11; d++)
        dense.push(
          mkStatShift('e1', `2026-01-${String(d).padStart(2, '0')}`, '09:00', '18:00'),
        );
      mockPrismaService.shift.findMany.mockResolvedValueOnce(dense); // ±8-day statutory set

      const res = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-31T23:59:59.999Z',
      });
      expect(
        res.hardViolations.some((h) => h.ruleId === 'statutory:weekly_rest'),
      ).toBe(true);
    });

    it('does NOT report a breach living purely in an adjacent month', async () => {
      mockPrismaService.shift.findMany.mockResolvedValueOnce([]); // strict January: empty
      mockPrismaService.shift.findMany.mockResolvedValueOnce([
        mkStatShift('e1', '2026-02-03', '06:00', '20:00'), // 14h net > 10h, but Feb (out of range)
      ]);
      const res = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-31T23:59:59.999Z',
      });
      expect(res.hardViolations).toHaveLength(0);
    });
  });
  ```
  Run: `pnpm --filter @pawly/api test -- planning.service`
  Expected: `Tests:` count rises by 2, both passing. exit 0.
  Commit: `git add apps/api/src/modules/planning/planning.service.spec.ts && git commit -m "test(KON-134): publish detects straddling deficit, ignores adjacent-month breach"`

- [x] **Task 5: Feed the generation eligibility window with cross-month context in `planning-generation.service.ts`** [AC: 1, 3]
  In `apps/api/src/modules/planning/planning-generation.service.ts`:

  **(a)** Add the loader method next to `loadBorderWeekShifts` (currently `:4807`). It uses a `date: { gte, lte }` predicate (distinct from border's `date.in` and survivors' `OR`) and returns ONLY the out-of-month rows:
  ```ts
    /**
     * Story 13-2 (KON-134) — the out-of-month shifts the +/-8-real-day statutory window in
     * evaluateEligibility (:1347-1372) needs to see a consecutive-day run or a 35h-rest
     * deficit that straddles the month frontier. loadBorderWeekShifts only reaches the
     * ISO-straddle days + immediate D-1/D+1 (13-3), so days 2..8 across the frontier are
     * invisible and a 7th consecutive day hides. These rows feed `assignmentIndex` ONLY —
     * never the weekly / monthly / rotation counters — so fill and equity stay byte-identical
     * (invariant 11-10 / epic-13 context §3.6). A single `date: { gte, lte }` query (month +/- 8
     * days) is filtered to out-of-month here; the in-month days are seeded with full fidelity
     * by survivors / freshly-assigned shifts.
     */
    private async loadStatutoryBorderShifts(
      clinicId: string,
      month: string,
    ): Promise<AssignedShift[]> {
      const [year, monthNum] = month.split('-').map(Number);
      const firstDayStr = new Date(Date.UTC(year, monthNum - 1, 1))
        .toISOString()
        .split('T')[0];
      const lastDayStr = new Date(Date.UTC(year, monthNum, 0))
        .toISOString()
        .split('T')[0];

      const windowStart = new Date(`${firstDayStr}T00:00:00.000Z`);
      windowStart.setUTCDate(windowStart.getUTCDate() - 8);
      const windowEnd = new Date(`${lastDayStr}T00:00:00.000Z`);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 8);

      const shifts = await this.prisma.shift.findMany({
        where: { clinicId, date: { gte: windowStart, lte: windowEnd } },
        select: {
          employeeId: true,
          date: true,
          startTime: true,
          endTime: true,
          shiftTypeCode: true,
          breakMinutes: true,
        },
      });

      return shifts
        .map((s) => ({
          employeeId: s.employeeId,
          date: s.date.toISOString().split('T')[0],
          startTime: s.startTime,
          endTime: s.endTime,
          shiftTypeCode: s.shiftTypeCode,
          breakMinutes: s.breakMinutes,
        }))
        .filter((s) => s.date < firstDayStr || s.date > lastDayStr);
    }
  ```

  **(b)** Seed it into `assignmentIndex` ONLY, right after the existing border-shift seed loop (currently ends `:386`, just before `const allShiftsForScoring`). De-dupe against the border days so the D±1 overlap pool is never double-seeded:
  ```ts
      // Story 13-2 (KON-134) — widen the cross-month context the statutory eligibility window
      // (evaluateEligibility, step 5) reads to +/-8 real days. Seed into assignmentIndex ONLY:
      // deliberately NOT into dayOfWeekCounts / weeklyMinutesCounter / allShiftsForScoring, so
      // rotation/equity/fill decisions stay byte-identical (invariant 11-10). Border days
      // (ISO-straddle + D±1) are already seeded above — skip them to avoid double-counting.
      const borderDateSet = new Set(borderShifts.map((bs) => bs.date));
      const statutoryBorderShifts = await this.loadStatutoryBorderShifts(
        clinicId,
        month,
      );
      for (const sbs of statutoryBorderShifts) {
        if (borderDateSet.has(sbs.date)) continue;
        const key = `${sbs.employeeId}|${sbs.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(sbs);
        assignmentIndex.set(key, existing);
      }
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: existing generation tests still green — the new `date: { gte, lte }` query returns `[]` under the default `shift.findMany.mockResolvedValue([])` and never touches the fill/equity counters. exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-134): generation eligibility sees ±8 real days across the month frontier"`

- [x] **Task 6: Prove the generation straddle rejection in `planning-generation.service.spec.ts`** [AC: 1, 3]
  Add this test inside the existing `describe('generateMonthlyPlan', ...)` block (mirror the border test at `:1772`). One employee with a 6-day run ending 2025-12-31 (loaded via the statutory `gte/lte` query); the Jan-1 slot would be their 7th consecutive day and must NOT be assigned to them.
  ```ts
    it('Story 13-2 — rejects a 7th consecutive day straddling the month frontier', async () => {
      // Template: Thursday-only SURGERY slot (2026-01-01 is a Thursday).
      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Thursday Only',
        data: { days: [{ dayOfWeek: 4, slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }] }] },
        clinicId,
      });

      // emp-1 worked Dec 26–31 2025 (6 consecutive days), 09:00-15:00. Dec 29/30/31 land in
      // the border ISO week; Dec 26/27/28 come ONLY from the statutory gte/lte load — without
      // Task 5 emp-1 would show <=6 consecutive days and Jan 1 would be assignable.
      const priorRun = ['26', '27', '28', '29', '30', '31'].map((d) => ({
        employeeId: 'emp-1',
        date: new Date(`2025-12-${d}T00:00:00.000Z`),
        startTime: '09:00',
        endTime: '15:00',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 0,
      }));
      mockPrismaService.shift.findMany.mockImplementation((args: any) => {
        if (args?.where?.OR) return Promise.resolve([]); // survivors
        if (args?.where?.date?.gte && args?.where?.date?.lte)
          return Promise.resolve(priorRun); // 13-2 statutory context
        return Promise.resolve([]); // border (date.in)
      });

      mockPrismaService.employee.findMany.mockResolvedValue([
        { id: 'emp-1', firstName: 'Alice', lastName: 'Martin', jobType: 'VET', contractHours: 60 },
      ]);
      mockPlanningService.listRules.mockResolvedValue([]); // statutory limits are non-disableable

      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            shift: {
              findMany: jest.fn().mockResolvedValue([]),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest.fn().mockResolvedValue([]),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.generateMonthlyPlan(clinicId, '2026-01', 'tpl-1');

      // Jan 1 must be a hole for emp-1 (7th consecutive day), not an assignment.
      const jan1Assigned = result.assignments.some((a) => a.date === '2026-01-01');
      expect(jan1Assigned).toBe(false);
      // Later Thursdays (Jan 8/15/22/29) are non-consecutive and still assignable.
      expect(result.assignments.length).toBeGreaterThan(0);
    });
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: the new test passes; it would fail (Jan 1 assigned) against the pre-Task-5 code. exit 0. **If `a.date` is a `Date` rather than an ISO string in `result.assignments`, normalise with `new Date(a.date).toISOString().split('T')[0]` — verify the shape while wiring RED.**
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-134): generation rejects a 7th consecutive day across the frontier"`

- [x] **Task 7: Guard the move path with a straddle test in `move-validation.spec.ts`** [AC: 3]
  The move path already loads the ±8-real-day `statutoryWindowShifts` (13-1) and Task 1's fix flows through `wouldExceedStatutory` — no move code changes. This test locks AC3 for the move path. Append inside the existing `describe('evaluateMoveViolations', ...)` block (reuses `baseCtx` / `shiftAt`):
  ```ts
    it('Story 13-2 — flags a 7th consecutive worked day straddling the month frontier', () => {
      // emp-2 already worked Dec 26–31 2025 (6 consecutive days) in the ±8-real-day window;
      // moving a shift onto Thursday Jan 1 2026 is the 7th consecutive day.
      const priorRun = [
        '2025-12-26',
        '2025-12-27',
        '2025-12-28',
        '2025-12-29',
        '2025-12-30',
        '2025-12-31',
      ].map((d) => shiftAt(d, '09:00', '15:00'));
      const result = evaluateMoveViolations(
        baseCtx({
          shift: shiftAt('2026-01-01', '09:00', '15:00', {
            id: 'moved',
            employeeId: 'emp-1',
          }),
          target: { employeeId: 'emp-2', date: '2026-01-01' },
          statutoryWindowShifts: priorRun,
        }),
      );
      expect(result.hard.some((h) => h.message.includes('CONSECUTIVE_DAYS'))).toBe(
        true,
      );
    });
  ```
  Run: `pnpm --filter @pawly/api test -- move-validation`
  Expected: `Tests:` count rises by 1, passing. exit 0.
  Commit: `git add apps/api/src/modules/planning/move-validation.spec.ts && git commit -m "test(KON-134): move path detects a 7th consecutive day across the frontier"`

## Dev Notes

- **Architecture:** Statutory limits are the pure, non-disableable core in `french-labor-law.ts` (Story 11-3), evaluated INDEPENDENTLY of any configured `PlanningRule` (epic-13 context §3.4). Two entry shapes: **incremental** `wouldExceedStatutory(windowShifts, candidate)` (returns only breaches the candidate INTRODUCES — used by move / create / generation-eligibility) and **post-hoc** `findStatutoryViolations(shifts)` (every breach in a set — used by publish / health-bar). This story does NOT add limits or change what counts as a breach; it (1) gives every path the same ±8-real-day data window and (2) fixes `clampGapLen` so a data-window edge no longer grants phantom weekly-rest credit. Dates are UTC `YYYY-MM-DD`, times `HH:MM` minute arithmetic (epic-13 context §3.8) — introduce **no** local-TZ `Date` math.

- **The three windows are the point.** `move`/`create` already load `[target − 8d, target + 8d]` (13-1); this story makes **publish** load `[startDate − 8d, endDate + 8d]` and **generation** seed `[monthStart − 8d, monthEnd + 8d]` (out-of-month only) into `assignmentIndex`. `wouldExceedStatutory` derives its rest-credit window as `candidate ± 8d` to match exactly what every caller loads — so no incremental call-site signature changes (generation `:1364`, createManualShift `:2714`, move `move-validation.ts:330` are untouched).

- **Do not widen `validShifts`.** Only the statutory checks get the wide window. Staffing / skill / rotation / contract / monthly-cap stay on the strict month — widening them would double-count monthly caps and mis-count per-day staffing.

- **Do not pollute the generation counters.** `loadStatutoryBorderShifts` seeds `assignmentIndex` ONLY. `dayOfWeekCounts`, `weeklyMinutesCounter`, and `allShiftsForScoring` MUST stay exactly as `loadBorderWeekShifts` + survivors leave them, or the byte-identical-greedy invariant (11-10) breaks and equity/fill decisions shift.

- **Testing:** Jest, `*.spec.ts`, from repo root — `pnpm --filter @pawly/api test -- <pattern>` (the root `pnpm test` is broken by the rtk shim — memory `epic11-dev-gotchas`). The generation spec keys `shift.findMany` on the `where` predicate shape (`date.in` = border, `OR` = survivors, **`date.gte`+`date.lte` = 13-2 statutory** — memory note): route the three loads by predicate, never by call order. If `@pawly/*` dist is stale, rebuild it before the app tsc pass (same memory).

- **Dependencies:** none new. Pure TS + Prisma `shift.findMany`. No schema, tRPC, or package changes. No web change (13-2 is server-side; the grid's existing optimistic rollback + error toast already surface a rejected move — 13-1 scope decision).

### Existing code at write time (Step-0 quotes — verbatim, re-locate before editing)

`apps/api/src/modules/planning/french-labor-law.ts:201-224` (current — the phantom-rest source):
```ts
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
```
`restGaps` (`:163-171`) is UNCHANGED — it still emits the `-BIG` lead / `+BIG` trail sentinels; Task 1 only changes how `clampGapLen` scores them. `addDays` (`:86-90`), `shiftEpoch` (`:82-84`), `MIN_PER_DAY` (`:67`) are the module-level helpers Task 1 reuses for the `win` derivation.

`apps/api/src/modules/planning/planning.service.ts:241-285` (current — publish statutory arm, strict month):
```ts
    // Story 11-3 — statutory French labor-law HARD limits, ALWAYS enforced (independent of
    // configured rules). Surfaces in the Planning Health Bar and blocks publication.
    this.evaluateStatutoryLimits(validShifts, hardViolations);

    return { hardViolations, softViolations, rules };
  }

  private static readonly STATUTORY_MESSAGE_KEY: Record<
    StatutoryViolationKind,
    string
  > = {
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
```
`validShifts` (`:178-191`) — the strict-month load — stays exactly as-is; Task 3 adds a SECOND `shift.findMany` for the statutory window and leaves this one untouched. `statutoryToHardViolation` (`:293-314`) is unchanged and consumes `StatutoryViolation` (already imported at `:28-34`).

`apps/api/src/modules/planning/planning-generation.service.ts:366-386` (current — border seed loop; Task 5 seeds AFTER this):
```ts
    const borderShifts = await this.loadBorderWeekShifts(clinicId, month);

    const assignedShifts: AssignedShift[] = [];
    const assignmentIndex = new Map<string, AssignedShift[]>();

    // Story 11-10 — O(1) per-(employee, ISO-weekday) rotation index. Reflects the
    // exact multiset in allShiftsForScoring (border + survivors + assigned) so the
    // rotation-equity evaluators lookup instead of re-scanning alreadyAssigned.
    const dayOfWeekCounts = new Map<string, Map<number, number>>();

    // Pre-seed assignmentIndex with border shifts (for overlap/consecutive checks)
    for (const bs of borderShifts) {
      const key = `${bs.employeeId}|${bs.date}`;
      const existing = assignmentIndex.get(key) || [];
      existing.push(bs);
      assignmentIndex.set(key, existing);
      // Story 11-10 — border shifts are already part of allShiftsForScoring, so
      // the pre-index rotation scan counted them too. Seed them here to preserve
      // bit-for-bit equivalence (see Dev Notes → Equivalence).
      this.incrementDayOfWeekCount(dayOfWeekCounts, bs.employeeId, bs.date);
    }
```
`apps/api/src/modules/planning/planning-generation.service.ts:1347-1372` (current — the generation statutory window that READS `assignmentIndex`; UNCHANGED by this story — Task 5 only makes the index it reads contain the cross-month days):
```ts
    // 5) French labor-law HARD limits (Story 11-3) — +/-8 day window around the slot
    {
      const statutoryWindow: StatutoryShift[] = [];
      let cursor = this.getPreviousDate(slot.date);
      for (let i = 0; i < 8; i++) {
        statutoryWindow.push(
          ...(ctx.assignmentIndex.get(`${emp.id}|${cursor}`) || []),
        );
        cursor = this.getPreviousDate(cursor);
      }
      cursor = slot.date;
      for (let i = 0; i < 9; i++) {
        statutoryWindow.push(
          ...(ctx.assignmentIndex.get(`${emp.id}|${cursor}`) || []),
        );
        cursor = this.getNextDate(cursor);
      }
      const statutoryBreach = wouldExceedStatutory(statutoryWindow, {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        breakMinutes: slot.breakMinutes,
      });
      if (statutoryBreach.length > 0)
        return { eligible: false, blockedOnlyByRotation: false };
    }
```
`loadBorderWeekShifts` (`:4807-4893`) is UNCHANGED — it keeps returning ISO-straddle + D±1 (13-3), and Task 5's `loadStatutoryBorderShifts` sits beside it. `getPreviousDate` / `getNextDate` (`:3630-3642`) and `AssignedShift` are reused.

### File decisions (one responsibility each)

- **`apps/api/src/modules/planning/french-labor-law.ts`** — *Pure statutory core.* Owns the four limits + the incremental/post-hoc evaluators. Change: weekly-rest credit is bounded to the loaded data window. In: `StatutoryShift[]` + optional window bounds. Out: `StatutoryViolation[]` / `StatutoryViolationKind[]`. No I/O.
- **`apps/api/src/modules/planning/planning.service.ts`** — *Rule + publish/health-bar validation over a shift set.* Change: statutory checks load a ±8-day window and report only violations attributable to the published range. In: `clinicId`, `ValidateShiftsInput`. Out: `{ hardViolations, softViolations, rules }`.
- **`apps/api/src/modules/planning/planning-generation.service.ts`** — *Greedy generation + manual write orchestration.* Change: adds `loadStatutoryBorderShifts` and seeds it into `assignmentIndex` only. In: `clinicId`, `month`. Out: `AssignedShift[]` (into the index).
- **`*.spec.ts` (french-labor-law, planning.service, planning-generation.service, move-validation)** — *Per-path proof of AC3.* Each adds the straddle case for its path.

## File List

_Files this story modifies (final list confirmed by aped-dev at completion):_

- `apps/api/src/modules/planning/french-labor-law.ts`
- `apps/api/src/modules/planning/french-labor-law.spec.ts`
- `apps/api/src/modules/planning/planning.service.ts`
- `apps/api/src/modules/planning/planning.service.spec.ts`
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`
- `apps/api/src/modules/planning/move-validation.spec.ts`

## Dev Agent Record

### Summary

All three validation paths now see the same ±8-real-day cross-month window, and `clampGapLen`
no longer credits phantom weekly-rest at a data-window edge. `french-labor-law.ts` gains an
optional `win` bound threaded through `weekHasRestDeficit` / `findStatutoryViolations` /
`wouldExceedStatutory` (window-less callers keep legacy behaviour); publish loads a separate
±8-day statutory set filtered to the published range; generation seeds a statutory-only
cross-month context into `assignmentIndex` alone (fill/equity counters untouched). AC3 is
proven per path (french-labor-law, publish, generation, move). Scope held — the move arm was
already shipped by 13-1 and is only guarded here, no new move code.

### Files changed

- `apps/api/src/modules/planning/french-labor-law.ts`
- `apps/api/src/modules/planning/french-labor-law.spec.ts`
- `apps/api/src/modules/planning/planning.service.ts`
- `apps/api/src/modules/planning/planning.service.spec.ts`
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`
- `apps/api/src/modules/planning/move-validation.spec.ts`

### Deviations

- **Task 6 test fix (createManyAndReturn echo).** The story's Task-6 mock set
  `createManyAndReturn: mockResolvedValue([])`. `buildResult` derives `result.assignments`
  from that return value, so `assignments` would always be empty — making `jan1Assigned`
  vacuously `false` (a false-green that never proves Jan 1 is rejected) and
  `assignments.length > 0` impossible. Replaced it with an implementation that echoes the
  persisted `data` (with synthetic ids) so `result.assignments` reflects the plan the
  generator actually wrote. With the fix the test goes genuinely RED pre-Task-5 (Jan 1
  assigned) and GREEN post-Task-5. No production-code deviation.
- Environment: the worktree was missing `apps/api/node_modules` (aped-sprint only symlinks the
  root); symlinked it to the main checkout per project memory (never `pnpm install`).

### Test output

Story-scoped suite (french-labor-law, planning.service, planning-generation.service,
move-validation), fresh run from repo root:

```
$ pnpm --filter @pawly/api test -- french-labor-law planning.service.spec planning-generation.service.spec move-validation
Test Suites: 4 passed, 4 total
Tests:       298 passed, 298 total
```

Full `@pawly/api` suite: 1135 passed, 1 failed — the single failure is the pre-existing
timing-flaky perf test `meets NFR2 when the ejection scan runs against many real holes`
(wall-clock budget under full-suite contention; the test's own comment documents this). It
passes in isolation (1505 ms < 2000 ms budget) and is untouched by this story.
