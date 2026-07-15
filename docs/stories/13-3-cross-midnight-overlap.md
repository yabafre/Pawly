# Story: 13-3-cross-midnight-overlap — Cross-Midnight Overlap Correctness

**Epic:** Epic 13 — Planning Integrity & Solver Fidelity
**Status:** ready-for-dev
**Branch:** feature/KON-132-13-3-cross-midnight-overlap
**Ticket:** KON-132 (Linear · project Pawly · blocks KON-135, KON-138)
**Origin:** Audit finding T3 (2026-07-14, HIGH) — `docs/triage-decision.md`. The only audited path where an INVALID plan can be SERVED.

> **Read first:** `docs/epics-context/epic-13-context.md` — §3 invariant 8 (UTC everywhere, `HH:MM` minute arithmetic, DST-immune) and §4 anchor map for 13-3.
>
> **Scope decision (locked with Alex at story time).** The audit frames T3 as an engine bug. It is — but exploration proved it is currently **unreachable**: `packages/validators` rejects `endTime <= startTime` on every shift type, and `prisma/seed.ts` defines none, so no cross-midnight shift can exist today. Fixing the engine alone would harden dead code. This story therefore **also unlocks the product capability** (validators + the two hard-coded front guards), so the user story is true end to end. The "+1 day" visual indicator on `ShiftCell` / `ShiftDayCard` and the error mapping on `ShiftTypeFormSheet` were **explicitly deferred to a separate UX story** — see § Out of scope.

## User Story

**As a** admin running night shifts, **I want** overlapping shifts detected across midnight, **so that** no engine — greedy, manual edit, or CP-SAT — can double-book an employee whose shift crosses midnight.

## Acceptance Criteria

1. **Given** an employee already holding a shift that runs past midnight (e.g. `22:00→06:00` on day D) and a slot on the adjacent day that overlaps it in real time, **When** the engine evaluates that employee's eligibility, **Then** the employee is excluded — the overlap is seen across the midnight boundary and across adjacent days, not only within one calendar date.
2. **Given** a candidate plan that would give one employee a cross-midnight slot and an overlapping slot on the adjacent date, **When** the CP-SAT model is built and its candidate plan is replayed for re-validation, **Then** the model forbids that pair and the replay rejects the double-booking — closing the only audited path where an invalid plan could be SERVED.
3. **Given** shifts that do not cross midnight, **When** the full API test suite runs, **Then** behaviour is unchanged and the suite stays green (byte-identical greedy default, epic-13 invariant 6).
4. **Given** a HARD minimum-rest-between-shifts rule and a previous-day shift that runs past midnight, **When** the engine evaluates a slot whose real rest gap from that shift is below the configured minimum, **Then** the employee is excluded — the gap is measured in real time, not from clock digits.
5. **Given** an admin defining a shift type in onboarding or in settings, **When** they submit a start time later than the end time (e.g. `22:00 → 06:00`), **Then** the shift type is accepted and persisted; **and** identical start and end times are still rejected; **and** clinic opening hours and special days keep requiring an end after the start.
6. **Given** two same-day slots whose combined span runs past midnight and exceeds the 13h statutory amplitude, **When** the solver model is built, **Then** the model forbids assigning both to the same employee.

## Tasks

- [ ] **Task 1 — RED: shift-interval primitive spec** [AC: 1, 3]

  Create `apps/api/src/modules/planning/shift-interval.spec.ts`. The module does not exist yet, so this fails at import — that IS the RED.

  ```ts
  import {
    shiftsOverlap,
    toAbsoluteInterval,
    restMinutesBetween,
  } from './shift-interval';

  describe('shift-interval (Story 13-3, KON-132)', () => {
    describe('toAbsoluteInterval', () => {
      it('maps a same-day shift to an absolute [start, end) minute interval', () => {
        const [start, end] = toAbsoluteInterval({
          date: '1970-01-02',
          startTime: '08:00',
          endTime: '12:00',
        });
        expect(start).toBe(1440 + 480);
        expect(end).toBe(1440 + 720);
      });

      it('extends an overnight shift past midnight (end < start)', () => {
        const [start, end] = toAbsoluteInterval({
          date: '1970-01-02',
          startTime: '22:00',
          endTime: '06:00',
        });
        expect(start).toBe(1440 + 1320);
        // 06:00 the NEXT day = 1320 + 8h
        expect(end).toBe(1440 + 1320 + 480);
      });

      it('treats end === start as a zero-length slot, never a 24h shift', () => {
        const [start, end] = toAbsoluteInterval({
          date: '2026-03-14',
          startTime: '09:00',
          endTime: '09:00',
        });
        expect(end).toBe(start);
      });
    });

    describe('shiftsOverlap', () => {
      it('detects an overnight shift overlapping the NEXT day', () => {
        expect(
          shiftsOverlap(
            { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
            { date: '2026-03-15', startTime: '05:00', endTime: '09:00' },
          ),
        ).toBe(true);
      });

      it('detects an overnight shift overlapping a same-date morning shift (the audited same-date wrap case)', () => {
        expect(
          shiftsOverlap(
            { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
            { date: '2026-03-14', startTime: '05:00', endTime: '09:00' },
          ),
        ).toBe(true);
      });

      it('detects an overnight shift overlapping the PREVIOUS day night shift', () => {
        expect(
          shiftsOverlap(
            { date: '2026-03-15', startTime: '00:00', endTime: '08:00' },
            { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
          ),
        ).toBe(true);
      });

      it('is symmetric', () => {
        const a = { date: '2026-03-14', startTime: '22:00', endTime: '06:00' };
        const b = { date: '2026-03-15', startTime: '05:00', endTime: '09:00' };
        expect(shiftsOverlap(a, b)).toBe(shiftsOverlap(b, a));
      });

      it('does not overlap at an exact junction (end === next start)', () => {
        expect(
          shiftsOverlap(
            { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
            { date: '2026-03-15', startTime: '06:00', endTime: '12:00' },
          ),
        ).toBe(false);
      });

      it('does not overlap for distant days', () => {
        expect(
          shiftsOverlap(
            { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
            { date: '2026-03-20', startTime: '05:00', endTime: '09:00' },
          ),
        ).toBe(false);
      });

      it('keeps same-date non-wrapping behaviour: overlapping pair', () => {
        expect(
          shiftsOverlap(
            { date: '2026-03-14', startTime: '08:00', endTime: '12:00' },
            { date: '2026-03-14', startTime: '11:00', endTime: '15:00' },
          ),
        ).toBe(true);
      });

      it('keeps same-date non-wrapping behaviour: disjoint pair', () => {
        expect(
          shiftsOverlap(
            { date: '2026-03-14', startTime: '08:00', endTime: '12:00' },
            { date: '2026-03-14', startTime: '12:00', endTime: '15:00' },
          ),
        ).toBe(false);
      });

      it('never overlaps a zero-length slot', () => {
        expect(
          shiftsOverlap(
            { date: '2026-03-14', startTime: '09:00', endTime: '09:00' },
            { date: '2026-03-14', startTime: '08:00', endTime: '12:00' },
          ),
        ).toBe(false);
      });

      it('crosses a month frontier (Dec 31 -> Jan 1)', () => {
        expect(
          shiftsOverlap(
            { date: '2026-12-31', startTime: '22:00', endTime: '06:00' },
            { date: '2027-01-01', startTime: '05:00', endTime: '09:00' },
          ),
        ).toBe(true);
      });
    });

    describe('restMinutesBetween', () => {
      it('measures the real gap for two same-day-ordered shifts', () => {
        expect(
          restMinutesBetween(
            { date: '2026-03-14', startTime: '08:00', endTime: '18:00' },
            { date: '2026-03-15', startTime: '08:00', endTime: '18:00' },
          ),
        ).toBe(840); // 18:00 -> 08:00 = 14h
      });

      it('measures the real gap after an overnight shift (the AC4 bug)', () => {
        expect(
          restMinutesBetween(
            { date: '2026-03-14', startTime: '22:00', endTime: '06:00' },
            { date: '2026-03-15', startTime: '08:00', endTime: '12:00' },
          ),
        ).toBe(120); // 06:00 -> 08:00 = 2h, NOT 26h
      });

      it('is symmetric', () => {
        const a = { date: '2026-03-14', startTime: '22:00', endTime: '06:00' };
        const b = { date: '2026-03-15', startTime: '08:00', endTime: '12:00' };
        expect(restMinutesBetween(a, b)).toBe(restMinutesBetween(b, a));
      });

      it('returns a negative gap for overlapping shifts', () => {
        expect(
          restMinutesBetween(
            { date: '2026-03-14', startTime: '08:00', endTime: '12:00' },
            { date: '2026-03-14', startTime: '11:00', endTime: '15:00' },
          ),
        ).toBeLessThan(0);
      });
    });
  });
  ```

  Run: `pnpm --filter @pawly/api test shift-interval`
  Expected RED: the suite fails to run — `Cannot find module './shift-interval'`. Emit the `Confirmed RED:` witness.
  Commit: `git add apps/api/src/modules/planning/shift-interval.spec.ts && git commit -m "test(KON-132): RED — shift-interval primitive spec [AC-1]"`

- [ ] **Task 2 — GREEN: shift-interval primitive** [AC: 1, 3, 4]

  Create `apps/api/src/modules/planning/shift-interval.ts` with exactly this content:

  ```ts
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

  /** True when two absolute intervals occupy the same real time. */
  export function intervalsOverlap(
    a: AbsoluteInterval,
    b: AbsoluteInterval,
  ): boolean {
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
  export function restMinutesBetween(
    a: IntervalShift,
    b: IntervalShift,
  ): number {
    const [aStart, aEnd] = toAbsoluteInterval(a);
    const [bStart, bEnd] = toAbsoluteInterval(b);
    return Math.max(bStart - aEnd, aStart - bEnd);
  }
  ```

  Run: `pnpm --filter @pawly/api test shift-interval`
  Expected GREEN: `Tests: 17 passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/shift-interval.ts && git commit -m "feat(KON-132): wrap-aware shift interval primitive [AC-1]"`

- [ ] **Task 3 — REFACTOR: french-labor-law consumes the primitive** [AC: 3]

  Removes the third hand-rolled copy of the wrap rule. Behaviour is identical, so the existing 11-3 suite is the regression net.

  In `apps/api/src/modules/planning/french-labor-law.ts`, add the import right after the file header comment (the file currently has no imports):

  ```ts
  import { toAbsoluteInterval } from './shift-interval';
  ```

  Replace the whole `mergedBusyIntervals` function (currently at `:140-159`) with:

  ```ts
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
  ```

  In the same file, fix the header comment at `:16-17` — the code has always treated `end === start` as zero-length, so `<=` is wrong. Replace:

  ```
   * (matches the generation service's getWeekBounds / getPreviousDate conventions). Overnight
   * shifts (endTime <= startTime) wrap past midnight.
  ```

  with:

  ```
   * (matches the generation service's getWeekBounds / getPreviousDate conventions). Overnight
   * shifts (endTime < startTime) wrap past midnight; endTime === startTime is a zero-length
   * slot. See shift-interval.ts for the shared primitive.
  ```

  `shiftEpoch` becomes unused after this change — delete the function (currently `:79-81`). Leave `dayDiff` in place (`isoWeekStart` and others still use it); if `tsc` reports it unused too, delete it as well.

  Run: `pnpm --filter @pawly/api test french-labor-law`
  Expected GREEN: the existing 11-3 suite passes unchanged, exit 0.
  Commit: `git add apps/api/src/modules/planning/french-labor-law.ts && git commit -m "refactor(KON-132): french-labor-law reuses the shift-interval primitive [AC-3]"`

- [ ] **Task 4 — RED: cross-midnight eligibility specs** [AC: 1, 3]

  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, find the existing test `prevents double-booking (same employee, overlapping times)` (inside the `describe('scoreAndAssign')` block) and add these two tests immediately after it, in the same `describe`. They reuse the file's existing `callScore` / `mockEmployees` / `baseConstraints` helpers — do not build the service yourself, this suite drives private methods through `callScore`.

  ```ts
  // Story 13-3 (KON-132) — AC1: an employee already holding a shift that runs
  // past midnight must not be given an overlapping slot on the adjacent day.
  it('prevents double-booking when an existing overnight shift on D-1 runs into the D slot', () => {
    const slot = {
      date: '2026-03-03',
      shiftTypeCode: 'SURGERY',
      startTime: '05:00',
      endTime: '09:00',
      breakMinutes: 0,
      requiredStaff: 1,
    };

    // emp-1 works 22:00 on 03-02 -> 06:00 on 03-03. The slot starts at 05:00 on
    // 03-03, so the real overlap is 05:00-06:00.
    const nightShift = {
      employeeId: 'emp-1',
      date: '2026-03-02',
      startTime: '22:00',
      endTime: '06:00',
      shiftTypeCode: 'SURGERY',
    };
    const assignmentIndex = new Map([['emp-1|2026-03-02', [nightShift]]]);

    const result: ScoreAndAssignResult = callScore(
      slot,
      [mockEmployees[0]],
      baseConstraints,
      [nightShift],
      assignmentIndex,
      new Map(),
      31 / 7,
    );

    expect(result.assigned.length).toBe(0);
    expect(result.holeInfo).toBeDefined();
  });

  it('prevents double-booking when the D slot itself crosses midnight into an existing D+1 shift', () => {
    const slot = {
      date: '2026-03-02',
      shiftTypeCode: 'SURGERY',
      startTime: '22:00',
      endTime: '06:00',
      breakMinutes: 0,
      requiredStaff: 1,
    };

    const morningShift = {
      employeeId: 'emp-1',
      date: '2026-03-03',
      startTime: '05:00',
      endTime: '09:00',
      shiftTypeCode: 'SURGERY',
    };
    const assignmentIndex = new Map([['emp-1|2026-03-03', [morningShift]]]);

    const result: ScoreAndAssignResult = callScore(
      slot,
      [mockEmployees[0]],
      baseConstraints,
      [morningShift],
      assignmentIndex,
      new Map(),
      31 / 7,
    );

    expect(result.assigned.length).toBe(0);
    expect(result.holeInfo).toBeDefined();
  });

  it('still assigns when the adjacent-day shift only touches the slot at the junction', () => {
    const slot = {
      date: '2026-03-03',
      shiftTypeCode: 'SURGERY',
      startTime: '06:00',
      endTime: '12:00',
      breakMinutes: 0,
      requiredStaff: 1,
    };

    // Ends exactly when the slot starts -> no overlap, emp-1 stays eligible.
    const nightShift = {
      employeeId: 'emp-1',
      date: '2026-03-02',
      startTime: '22:00',
      endTime: '06:00',
      shiftTypeCode: 'SURGERY',
    };
    const assignmentIndex = new Map([['emp-1|2026-03-02', [nightShift]]]);

    const result: ScoreAndAssignResult = callScore(
      slot,
      [mockEmployees[0]],
      baseConstraints,
      [nightShift],
      assignmentIndex,
      new Map(),
      31 / 7,
    );

    expect(result.assigned.length).toBe(1);
    expect(result.assigned[0].employeeId).toBe('emp-1');
  });
  ```

  Run: `pnpm --filter @pawly/api test planning-generation.service -t "double-booking"`
  Expected RED: the two cross-midnight tests fail — `expect(received).toBe(0)` receives `1`, because `timesOverlap` never sees the wrap and the bucket scan never looks at the adjacent day. The pre-existing same-date test and the junction test pass. Emit the `Confirmed RED:` witness.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-132): RED — cross-midnight eligibility [AC-1]"`

- [ ] **Task 5 — GREEN: wrap-aware overlap in the generation service** [AC: 1, 2, 3]

  In `apps/api/src/modules/planning/planning-generation.service.ts`:

  **5a.** Add to the import block at the top of the file:

  ```ts
  import { restMinutesBetween, shiftsOverlap } from './shift-interval';
  ```

  **5b.** Replace the whole `timesOverlap` method (currently `:3565-3578`) with the wrap-aware delegate. Keep the old name/signature for the ONE call site that is not a double-booking check (the special-day clamp at `:900`), and add the shift-aware predicate next to it:

  ```ts
  /**
   * Same-day clock-window overlap — NOT a double-booking check. Only the
   * special-day clamp uses this: it asks "do these two intra-day windows
   * intersect", where both operands are plain opening windows with no date and
   * no midnight crossing. Double-booking checks use shiftsOverlap (Story 13-3).
   */
  private windowsOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    return (
      toMinutes(start1) < toMinutes(end2) && toMinutes(end1) > toMinutes(start2)
    );
  }
  ```

  **5c.** At `:900`, rename the call `this.timesOverlap(` to `this.windowsOverlap(` — that call site keeps today's semantics exactly.

  **5d.** At `:546-555` (survivor coverage), replace the `if (!this.timesOverlap(...)) { continue; }` block with:

  ```ts
        if (
          !shiftsOverlap(
            {
              date: slot.date,
              startTime: slot.startTime,
              endTime: slot.endTime,
            },
            {
              date: slot.date,
              startTime: cov.startTime,
              endTime: cov.endTime,
            },
          )
        ) {
          continue;
        }
  ```

  (The coverage bucket is keyed `${slot.date}|${slot.shiftTypeCode}`, so both operands carry the slot's date by construction — the bucket entries have no `date` field of their own.)

  **5e.** In `evaluateEligibility`, replace the whole block 2 (currently `:1143-1157`) with the adjacent-day scan:

  ```ts
      // 2) Time overlap with an existing assignment — Story 13-3 (KON-132): scan
      // D-1/D/D+1, because a shift crossing midnight occupies real time on the
      // next calendar day. Mirrors the adjacent-day lookups the minRest and
      // statutory blocks below already do. Border shifts are pre-seeded into
      // assignmentIndex (see :347), so this also covers the month frontier.
      for (const bucketDate of [
        this.getPreviousDate(slot.date),
        slot.date,
        this.getNextDate(slot.date),
      ]) {
        const existingOnDate =
          ctx.assignmentIndex.get(`${emp.id}|${bucketDate}`) || [];
        for (const existing of existingOnDate) {
          if (
            shiftsOverlap(
              {
                date: slot.date,
                startTime: slot.startTime,
                endTime: slot.endTime,
              },
              {
                date: existing.date,
                startTime: existing.startTime,
                endTime: existing.endTime,
              },
            )
          ) {
            return { eligible: false, blockedOnlyByRotation: false };
          }
        }
      }
  ```

  Run: `pnpm --filter @pawly/api test planning-generation.service`
  Expected GREEN: the four Task-4 tests pass and the whole `planning-generation.service` suite stays green (AC-3), exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-132): wrap-aware overlap + adjacent-day scan in eligibility [AC-1][AC-2]"`

- [ ] **Task 6 — RED: minRest across midnight** [AC: 4]

  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add these tests inside the existing `describe('MIN_REST_HOURS between shifts')` block, reusing its `makeConstraintsWithMinRest` helper:

  ```ts
  // Story 13-3 (KON-132) — AC4: the rest gap must be measured in real time. With
  // an overnight neighbour the old arithmetic (24*60 - end + start) credited a
  // whole extra day: 06:00 -> 08:00 scored as 26h of rest instead of 2h.
  it('blocks employee when the previous-day shift ran past midnight and real rest is short', () => {
    const constraints = makeConstraintsWithMinRest(11);
    const slot = {
      date: '2026-03-03',
      shiftTypeCode: 'SURGERY',
      startTime: '08:00',
      endTime: '12:00',
      breakMinutes: 0,
      requiredStaff: 1,
    };

    // emp-1 works 22:00 on 03-02 -> 06:00 on 03-03. Real rest before 08:00 = 2h.
    const prevShift = {
      employeeId: 'emp-1',
      date: '2026-03-02',
      startTime: '22:00',
      endTime: '06:00',
      shiftTypeCode: 'SURGERY',
    };
    const assignmentIndex = new Map([['emp-1|2026-03-02', [prevShift]]]);

    const result: ScoreAndAssignResult = callScore(
      slot,
      [mockEmployees[0]],
      constraints,
      [prevShift],
      assignmentIndex,
      new Map(),
      31 / 7,
    );

    expect(result.assigned.length).toBe(0);
    expect(result.holeInfo).toBeDefined();
  });

  it('still allows employee when the previous-day shift ran past midnight but real rest suffices', () => {
    const constraints = makeConstraintsWithMinRest(11);
    const slot = {
      date: '2026-03-03',
      shiftTypeCode: 'SURGERY',
      startTime: '18:00',
      endTime: '22:00',
      breakMinutes: 0,
      requiredStaff: 1,
    };

    // Same overnight shift, but the slot starts at 18:00 -> real rest = 12h >= 11h.
    const prevShift = {
      employeeId: 'emp-1',
      date: '2026-03-02',
      startTime: '22:00',
      endTime: '06:00',
      shiftTypeCode: 'SURGERY',
    };
    const assignmentIndex = new Map([['emp-1|2026-03-02', [prevShift]]]);

    const result: ScoreAndAssignResult = callScore(
      slot,
      [mockEmployees[0]],
      constraints,
      [prevShift],
      assignmentIndex,
      new Map(),
      31 / 7,
    );

    expect(result.assigned.length).toBe(1);
    expect(result.assigned[0].employeeId).toBe('emp-1');
  });
  ```

  Run: `pnpm --filter @pawly/api test planning-generation.service -t "MIN_REST_HOURS"`
  Expected RED: `blocks employee when the previous-day shift ran past midnight and real rest is short` fails — `expect(received).toBe(0)` receives `1`, because the current arithmetic scores the gap as 26h. The second test passes both before and after (it is the no-false-positive guard). Emit the `Confirmed RED:` witness.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-132): RED — minRest across midnight [AC-4]"`

- [ ] **Task 7 — GREEN: minRest via absolute intervals** [AC: 4]

  In `apps/api/src/modules/planning/planning-generation.service.ts`, replace the whole `minRest` block (currently `:1196-1221`) with:

  ```ts
        const minRest = config.minRestHoursBetweenShifts as number | undefined;
        if (minRest) {
          const minRestMin = minRest * 60;
          // Story 13-3 (KON-132) — measure the REAL gap between absolute intervals.
          // The previous arithmetic (24*60 - end + start) silently credited a full
          // extra day whenever the neighbouring shift crossed midnight.
          const candidate = {
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
          };
          for (const neighbourDate of [
            this.getPreviousDate(slot.date),
            this.getNextDate(slot.date),
          ]) {
            const neighbours =
              ctx.assignmentIndex.get(`${emp.id}|${neighbourDate}`) || [];
            for (const neighbour of neighbours) {
              const rest = restMinutesBetween(candidate, {
                date: neighbour.date,
                startTime: neighbour.startTime,
                endTime: neighbour.endTime,
              });
              if (rest < minRestMin)
                return { eligible: false, blockedOnlyByRotation: false };
            }
          }
        }
  ```

  This keeps the existing scope on purpose: only D-1 and D+1 neighbours are checked, exactly as before. Same-day rest gaps remain unchecked — a pre-existing hole, out of scope here (noted in Dev Notes).

  Run: `pnpm --filter @pawly/api test planning-generation.service`
  Expected GREEN: both Task-6 tests pass, the whole suite stays green, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-132): minRest measures real gaps across midnight [AC-4]"`

- [ ] **Task 8 — RED: all three manual-write entry points across midnight** [AC: 1]

  The Epic-11 audit lesson (`epic-13-context.md` § 5) is that a guard is only verified when EVERY entry point is tested — `moveShift` was the untested one, twice. So all three get a test.

  Note on the fixtures below: each overnight neighbour is deliberately **under 10h net and under 13h amplitude** (e.g. `23:00→08:30` = 9h30). A longer night shift would trip the Story 11-3 statutory check and the call would throw for the WRONG reason — a false green that hides the overlap bug.

  **8a.** In `describe('moveShift')` (its `mockShift` is `2025-03-03 08:00→12:00`, and its `beforeEach` already stubs `shift.findMany` to `[]`), add after `throws ConflictException when shift overlaps with existing`:

  ```ts
  // Story 13-3 (KON-132) — AC1: emp-2 already works 23:00 on 03-02 -> 08:30 on
  // 03-03; moving shift-1 (08:00-12:00 on 03-03) onto emp-2 really overlaps
  // 08:00-08:30. The old clock-digit compare never saw it.
  it('throws ConflictException when the target employee has an overnight shift from the previous day', async () => {
    mockPrismaService.shift.findMany.mockResolvedValue([
      {
        ...mockShift,
        id: 'shift-night',
        employeeId: 'emp-2',
        date: new Date('2025-03-02T00:00:00.000Z'),
        startTime: '23:00',
        endTime: '08:30',
      },
    ]);
    await expect(
      service.moveShift(clinicId, 'shift-1', { targetEmployeeId: 'emp-2' }),
    ).rejects.toThrow('overlaps');
  });

  it('loads the adjacent days when checking overlap on a move', async () => {
    await service.moveShift(clinicId, 'shift-1', { targetEmployeeId: 'emp-2' });
    expect(mockPrismaService.shift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: {
            in: [
              new Date('2025-03-02T00:00:00.000Z'),
              new Date('2025-03-03T00:00:00.000Z'),
              new Date('2025-03-04T00:00:00.000Z'),
            ],
          },
        }),
      }),
    );
  });
  ```

  **8b.** In `describe('createManualShift')`, add after `throws ConflictException when shift overlaps with existing`. Its `beforeEach` stubs `clinicShiftType.findFirst` to `SURGERY 08:00→12:00`; `shift.findMany` is NOT stubbed there, and the SAME mock feeds both the overlap query and the statutory-window query (see the Story 11-3 test at `:5267` — use `mockResolvedValue`, not `...Once`):

  ```ts
  // Story 13-3 (KON-132) — AC1: existing 23:00 on 03-09 -> 08:30 on 03-10 really
  // overlaps the candidate SURGERY 08:00-12:00 on 03-10 (08:00-08:30). 9h30 net
  // keeps the statutory check quiet, so the ConflictException can only come from
  // the overlap guard.
  it('throws ConflictException when the new shift overlaps an overnight shift from the previous day', async () => {
    mockPrismaService.shift.findMany.mockResolvedValue([
      {
        id: 'ex-night',
        date: new Date('2026-03-09T00:00:00.000Z'),
        startTime: '23:00',
        endTime: '08:30',
        breakMinutes: 0,
        employeeId: 'emp-1',
        clinicId,
      },
    ]);
    await expect(
      service.createManualShift(clinicId, {
        employeeId: 'emp-1',
        date: '2026-03-10',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 0,
      }),
    ).rejects.toThrow('overlaps');
  });
  ```

  **8c.** In `describe('preValidateMove')` (its `mockShift` is `2025-03-03 08:00→12:00`, `defaultInput` targets `emp-2` on `2025-03-04`, and its `beforeEach` stubs `shift.findMany` to `[]` and `listRules` to `[]`), add after `returns HARD OVERLAP violation when shift times overlap`:

  ```ts
  // Story 13-3 (KON-132) — AC1: the advisory UX check must agree with the server
  // guard, or the grid shows green on a move the API then rejects.
  it('returns HARD OVERLAP violation when the target employee has an overnight shift from the previous day', async () => {
    mockPrismaService.shift.findMany.mockResolvedValue([
      {
        id: 'shift-night',
        clinicId,
        employeeId: 'emp-2',
        date: new Date('2025-03-03T00:00:00.000Z'),
        startTime: '23:00',
        endTime: '08:30',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 0,
      },
    ]);
    const result = await service.preValidateMove(clinicId, defaultInput);
    expect(result.hard.map((h) => h.rule)).toContain('OVERLAP');
  });
  ```

  Run: `pnpm --filter @pawly/api test planning-generation.service -t "overnight shift from the previous day"`
  then: `pnpm --filter @pawly/api test planning-generation.service -t "loads the adjacent days"`
  Expected RED: all four new tests fail — the three overlap ones because the clock-digit compare returns `false` on the wrapped neighbour (no throw / no `OVERLAP` entry), and `loads the adjacent days` because the query still passes a single `Date`. Emit the `Confirmed RED:` witness.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-132): RED — manual writes miss overnight neighbours [AC-1]"`

- [ ] **Task 9 — GREEN: adjacent-day window on the three manual-write queries** [AC: 1]

  In `apps/api/src/modules/planning/planning-generation.service.ts`, add this private helper next to `getPreviousDate` / `getNextDate` (around `:3590`):

  ```ts
  /**
   * Story 13-3 (KON-132) — the three UTC-midnight Date objects an overlap query
   * must load for a target day: a shift crossing midnight on D-1 occupies real
   * time on D, and a shift on D can run into D+1.
   */
  private adjacentDayRange(dateISO: string): Date[] {
    return [
      this.getPreviousDate(dateISO),
      dateISO,
      this.getNextDate(dateISO),
    ].map((d) => new Date(`${d}T00:00:00.000Z`));
  }
  ```

  **9a — `moveShift`.** Replace the query + loop (currently `:2364-2392`) with:

  ```ts
      // Check for time overlap on the target employee + date
      const overlapEmployeeId = target.targetEmployeeId || shift.employeeId;
      const overlapDateISO = target.targetDate
        ? target.targetDate
        : shift.date.toISOString().split('T')[0];

      const existingShifts = await this.prisma.shift.findMany({
        where: {
          employeeId: overlapEmployeeId,
          clinicId,
          date: { in: this.adjacentDayRange(overlapDateISO) },
          id: { not: shiftId },
        },
      });

      for (const existing of existingShifts) {
        if (
          shiftsOverlap(
            {
              date: overlapDateISO,
              startTime: shift.startTime,
              endTime: shift.endTime,
            },
            {
              date: existing.date.toISOString().split('T')[0],
              startTime: existing.startTime,
              endTime: existing.endTime,
            },
          )
        ) {
          throw new ConflictException(
            `Shift overlaps with existing shift (${existing.startTime}-${existing.endTime})`,
          );
        }
      }
  ```

  **9b — `createManualShift`.** Replace the query + loop (currently `:2492-2514`) with:

  ```ts
      // Check for time overlap on the target employee + date
      const existingShifts = await this.prisma.shift.findMany({
        where: {
          employeeId: input.employeeId,
          clinicId,
          date: { in: this.adjacentDayRange(input.date) },
        },
      });

      for (const existing of existingShifts) {
        if (
          shiftsOverlap(
            {
              date: input.date,
              startTime: shiftType.startTime,
              endTime: shiftType.endTime,
            },
            {
              date: existing.date.toISOString().split('T')[0],
              startTime: existing.startTime,
              endTime: existing.endTime,
            },
          )
        ) {
          throw new ConflictException(
            `Shift overlaps with existing shift (${existing.startTime}-${existing.endTime})`,
          );
        }
      }
  ```

  **9c — `preValidateMove`.** In the `Promise.all` (currently `:2689-2696`), replace the `prisma.shift.findMany` entry with:

  ```ts
        this.prisma.shift.findMany({
          where: {
            employeeId: input.targetEmployeeId,
            clinicId,
            date: { in: this.adjacentDayRange(input.targetDate) },
            id: { not: input.shiftId },
          },
        }),
  ```

  and replace the overlap loop (currently `:2756-2772`) with:

  ```ts
      // Check time overlap with existing shifts
      for (const existing of existingShifts) {
        if (
          shiftsOverlap(
            {
              date: input.targetDate,
              startTime: shift.startTime,
              endTime: shift.endTime,
            },
            {
              date: existing.date.toISOString().split('T')[0],
              startTime: existing.startTime,
              endTime: existing.endTime,
            },
          )
        ) {
          hard.push({
            rule: 'OVERLAP',
            message: `Shift overlaps with existing shift (${existing.startTime}-${existing.endTime})`,
          });
          break;
        }
      }
  ```

  Note `targetDateObj` (`:2655`) may become unused after 9c — if `tsc` flags it, delete the line.

  Run: `pnpm --filter @pawly/api test planning-generation.service`
  Expected GREEN: the Task-8 test passes, the whole suite stays green, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "feat(KON-132): manual-write overlap queries span adjacent days [AC-1]"`

- [ ] **Task 10 — RED: solver mutex + amplitude across midnight** [AC: 2, 6]

  In `apps/api/src/modules/planning/solver-model.spec.ts`, find `mutexes overlapping same-day slots per employee` (in `describe('buildSolverModel — hard constraint parity (AC6)')`) and add after it. These reuse the file's existing `emp` / `slot` / `baseInput` factories — note `slot(id, date, startTime, endTime, breakMinutes, requiredStaff, requiredJobTypes)` and that `baseInput` ships two employees, so each fixture below pins a single employee to keep the mutex count unambiguous.

  ```ts
  // Story 13-3 (KON-132) — AC2: a pair the greedy engine would refuse must be
  // forbidden in the model too, or the solver can propose it and the plan is SERVED.
  it('mutexes a cross-midnight pair on adjacent dates', () => {
    const input = baseInput({
      employees: [emp('a')],
      slots: [
        slot('s1', '2026-08-03', '22:00', '06:00'),
        slot('s2', '2026-08-04', '05:00', '09:00'),
      ],
    });
    const model = buildSolverModel(input);
    const mutex = model.constraints.filter(
      (c) => c.kind === 'linearLe' && c.tag.startsWith('overlap:'),
    );
    expect(mutex).toHaveLength(1);
    expect(mutex[0].kind === 'linearLe' && mutex[0].bound).toBe(1);
  });

  it('does not mutex a cross-midnight pair that only touches at the junction', () => {
    const input = baseInput({
      employees: [emp('a')],
      slots: [
        slot('s1', '2026-08-03', '22:00', '06:00'),
        slot('s2', '2026-08-04', '06:00', '12:00'),
      ],
    });
    const model = buildSolverModel(input);
    expect(
      model.constraints.filter(
        (c) => c.kind === 'linearLe' && c.tag.startsWith('overlap:'),
      ),
    ).toHaveLength(0);
  });

  // AC6: 06:00->14:00 plus 22:00->06:00 on ONE date spans 06:00 to 06:00 next day
  // = 24h amplitude, far past the statutory 13h. The raw HH:MM span scored it 8h.
  it('emits the statutory amplitude mutex when a same-date pair spans midnight', () => {
    const input = baseInput({
      employees: [emp('a')],
      slots: [
        slot('s1', '2026-08-03', '06:00', '14:00'),
        slot('s2', '2026-08-03', '22:00', '06:00'),
      ],
    });
    const model = buildSolverModel(input);
    expect(
      model.constraints.filter(
        (c) => c.kind === 'linearLe' && c.tag.startsWith('statutory-amplitude:'),
      ),
    ).toHaveLength(1);
  });
  ```

  Run: `pnpm --filter @pawly/api test solver-model`
  Expected RED: `mutexes a cross-midnight pair on adjacent dates` fails (0 mutexes — `a.date !== b.date` short-circuits) and `emits the statutory amplitude mutex when a same-date pair spans midnight` fails (span computed as 480 < 780). Emit the `Confirmed RED:` witness.
  Commit: `git add apps/api/src/modules/planning/solver-model.spec.ts && git commit -m "test(KON-132): RED — solver mutex + amplitude across midnight [AC-2][AC-6]"`

- [ ] **Task 11 — GREEN: solver model wrap-awareness** [AC: 2, 6]

  In `apps/api/src/modules/planning/solver-model.ts`:

  **11a.** Add to the import block (the file currently imports only `EquityWeights`):

  ```ts
  import {
    intervalsOverlap,
    toAbsoluteInterval,
    type AbsoluteInterval,
  } from './shift-interval';
  ```

  **11b.** Replace `overlaps` and `amplitudeExceeded` (currently `:146-160`) with interval-based versions. They take PRE-COMPUTED intervals: the pairwise loop is O(slots²) per employee, so parsing dates inside it would burn the NFR2 budget.

  ```ts
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
  ```

  **11c.** In `buildSolverModel`, pre-compute one interval per slot. Insert immediately after `const slotById = new Map(slots.map((s) => [s.id, s]));` (currently `:194`):

  ```ts
    // Story 13-3 (KON-132) — one absolute interval per slot, computed once. The
    // pairwise mutex loop below is O(slots^2) per employee; date parsing inside it
    // would be a NFR2 regression.
    const intervalBySlotId = new Map<string, AbsoluteInterval>(
      slots.map((s) => [s.id, toAbsoluteInterval(s)]),
    );
  ```

  **11d.** In the pairwise mutex loop, replace the two calls (currently `:218` and `:228`) so they pass the pre-computed intervals:

  ```ts
          const A = evSlots[i];
          const B = evSlots[j];
          const iA = intervalBySlotId.get(A.s.id)!;
          const iB = intervalBySlotId.get(B.s.id)!;
          if (overlaps(iA, iB)) {
  ```

  and, for the amplitude branch:

  ```ts
          } else if (amplitudeExceeded(A.s, B.s, iA, iB)) {
  ```

  Leave every constraint `tag` string untouched — `solver-engine.service.ts` and the replay motives key off them.

  Run: `pnpm --filter @pawly/api test solver-model`
  Expected GREEN: the three Task-10 tests pass and the existing 12-1 model suite stays green, exit 0.
  Commit: `git add apps/api/src/modules/planning/solver-model.ts && git commit -m "feat(KON-132): solver mutex + amplitude are wrap-aware [AC-2][AC-6]"`

- [ ] **Task 12 — RED: validators accept overnight shift types** [AC: 5]

  In `packages/validators/src/clinic/shift-type.schema.test.ts`, add:

  ```ts
  // Story 13-3 (KON-132) — AC5 (verbatim): "Given an admin defining a shift type
  // in onboarding or in settings, When they submit startTime: '22:00' /
  // endTime: '06:00', Then it is accepted and persisted; and endTime === startTime
  // is still rejected (zero-length slot)."
  it('accepts an overnight shift type (endTime before startTime)', () => {
    const result = createShiftTypeSchema.safeParse({
      name: 'Night',
      code: 'NIGHT',
      startTime: '22:00',
      endTime: '06:00',
      breakMinutes: 0,
      color: '#123456',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a zero-length shift type (endTime === startTime)', () => {
    const result = createShiftTypeSchema.safeParse({
      name: 'Broken',
      code: 'BRK',
      startTime: '09:00',
      endTime: '09:00',
      breakMinutes: 0,
      color: '#123456',
    });
    expect(result.success).toBe(false);
  });

  it('accepts an overnight shift type on update', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      startTime: '22:00',
      endTime: '06:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a zero-length shift type on update', () => {
    const result = updateShiftTypeSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      startTime: '09:00',
      endTime: '09:00',
    });
    expect(result.success).toBe(false);
  });
  ```

  In `packages/validators/src/clinic/onboarding.schema.test.ts`, the tests asserting the old message at `:156`, `:224`, `:433`, `:446`, `:552` must be re-read one by one: the ones covering **shift types** flip to accepting the overnight case; the ones covering **work hours / clinic opening** stay exactly as they are (opening hours keep `end > start`, gated by `is24_7`). Add alongside the shift-type ones:

  ```ts
  it('accepts an overnight shift type in the onboarding payload', () => {
    const result = shiftTypeSchema.safeParse({
      name: 'Night',
      code: 'NIGHT',
      startTime: '22:00',
      endTime: '06:00',
      breakMinutes: 0,
      color: '#123456',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a zero-length shift type in the onboarding payload', () => {
    const result = shiftTypeSchema.safeParse({
      name: 'Broken',
      code: 'BRK',
      startTime: '09:00',
      endTime: '09:00',
      breakMinutes: 0,
      color: '#123456',
    });
    expect(result.success).toBe(false);
  });
  ```

  Run: `pnpm --filter @pawly/validators test`
  Expected RED: the four "accepts an overnight shift type" tests fail (`success` is `false` — the refine still demands `end > start`); the zero-length ones already pass. Emit the `Confirmed RED:` witness.
  Commit: `git add packages/validators/src/clinic/shift-type.schema.test.ts packages/validators/src/clinic/onboarding.schema.test.ts && git commit -m "test(KON-132): RED — overnight shift types rejected by validators [AC-5]"`

- [ ] **Task 13 — GREEN: unlock overnight shift types (validators + front guards)** [AC: 5]

  **13a.** In `packages/validators/src/clinic/onboarding.schema.ts`, replace `shiftTypeSchema` (currently `:61-64`) with:

  ```ts
  // Story 13-3 (KON-132) — a shift type may cross midnight (22:00 -> 06:00); the
  // engine reads endTime < startTime as an overnight wrap (see shift-interval.ts).
  // Only a zero-length slot is meaningless, so equality is what we reject. Clinic
  // opening hours and special days keep their end > start rule below.
  export const shiftTypeSchema = shiftTypeFieldsSchema.refine(
    (data) => data.endTime !== data.startTime,
    { message: 'Start and end times must differ', path: ['endTime'] }
  );
  ```

  **13b.** In `packages/validators/src/clinic/shift-type.schema.ts`, replace `createShiftTypeSchema` (`:4-7`) and the `updateShiftTypeSchema` refine (`:30-38`) with:

  ```ts
  export const createShiftTypeSchema = shiftTypeFieldsSchema.refine(
    (data) => data.endTime !== data.startTime,
    { message: "Start and end times must differ", path: ["endTime"] },
  );
  ```

  ```ts
  export const updateShiftTypeSchema = updateShiftTypeFieldsSchema.refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return data.endTime !== data.startTime;
      }
      return true;
    },
    { message: "Start and end times must differ", path: ["endTime"] },
  );
  ```

  Do NOT touch `updateWorkHoursSchema` (`:35-38`), `updateClinicConfigSchema` (`:43-49`), `completeOnboardingSchema`'s `is24_7` refine (`:78-84`), or anything in `operational-config.schema.ts` — opening hours and special days keep `end > start`, and `operational-config.schema.test.ts:134` pins that.

  **13c.** In `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx`, at `:48`, replace:

  ```ts
                  st.endTime <= st.startTime
  ```

  with:

  ```ts
                  st.endTime === st.startTime
  ```

  **13d.** In `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx`, at `:210`, replace:

  ```ts
                st.endTime > st.startTime &&
  ```

  with:

  ```ts
                st.endTime !== st.startTime &&
  ```

  Leave `:199` (case 1, work hours) untouched — that is the `is24_7` opening-hours gate.

  Run: `pnpm --filter @pawly/validators test`
  Expected GREEN: `Tests: ... passed`, exit 0, with the four overnight tests now passing.
  Commit: `git add packages/validators/src/clinic/onboarding.schema.ts packages/validators/src/clinic/shift-type.schema.ts "apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx" "apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx" && git commit -m "feat(KON-132): allow shift types crossing midnight [AC-5]"`

- [ ] **Task 14 — Full regression + typecheck** [AC: 3]

  Rebuild the shared packages before typechecking the apps — `@pawly/*` have no path mapping, so a stale `dist` silently hides validator changes from `apps/web` (Epic 11 lesson, project memory).

  ```bash
  pnpm --filter @pawly/validators build
  pnpm --filter @pawly/api test
  pnpm --filter @pawly/validators test
  pnpm --filter @pawly/web test
  ```

  Expected: three green suites, exit 0 each. API suite must show no new failures versus `develop` (AC-3). Do NOT run bare `pnpm test` from the root — the rtk shim breaks the root runner (project memory).

  Commit: nothing to commit if all green (this task is a gate). If a fix is needed, commit it as `fix(KON-132): <what> [AC-3]`.

## Dev Notes

### Architecture / patterns (all verified in code at story-write time)

- **The wrap convention already exists and is unanimous.** `rule-engine.ts:82`, `french-labor-law.ts:101`, `solver-model.ts:123` and `planning-generation.service.ts:3585` all compute `end >= start ? end - start : 1440 - start + end`. `end === start` is a **zero-length slot** everywhere — never 24h. `timesOverlap` and the solver's `overlaps` / `amplitudeExceeded` are the only three places that ignore the wrap. This story aligns them and extracts the rule into one primitive; it does not invent a convention.
- **Two header comments were wrong**, not the code: `french-labor-law.ts:17` and `rule-engine.ts:16` say "endTime <= startTime wrap past midnight". Task 3 fixes the first. `rule-engine.ts:16` is left alone (out of this story's File List) — flag it in the review if you want it fixed too.
- **The replay is not a separate path.** `runSolverImprovePass` (`:4164-4176`, its docstring is explicit) re-checks every candidate assignment through `evaluateEligibility`. Fixing block 2 of that predicate (Task 5e) satisfies AC-2's replay half with no extra code. Do not add a second overlap check inside the improve pass.
- **Border shifts are pre-seeded** into `assignmentIndex` at `:347-357` ("Pre-seed assignmentIndex with border shifts (for overlap/consecutive checks)"), so the D-1/D+1 scan also covers the month frontier (a Dec-31 22:00→06:00 shift versus a Jan-1 slot). No extra loading is needed for AC-1.
- **The adjacent-day scan pattern is local.** `evaluateEligibility` already reads `getPreviousDate` / `getNextDate` buckets for minRest (`:1199-1220`) and walks a ±8-day window for statutory limits (`:1224-1240`). Task 5e follows that shape.
- **Perf (NFR2, generation < 2s).** The solver's pairwise mutex loop is O(slots²) per employee; `toAbsoluteInterval` does two `Date.parse` calls, so it MUST be hoisted out of that loop (Task 11c). In `evaluateEligibility` the scan is 3 Map lookups per (employee, slot) — the statutory block right below already does 17, so this is noise.
- **Data flow untouched.** No tRPC procedure, no Prisma migration, no new dependency. The three manual-write queries change their `where.date` from a scalar to an `in` list of three UTC-midnight `Date` objects.

### Existing code at write time (Step 0 — verbatim)

`apps/api/src/modules/planning/planning-generation.service.ts:3565-3578` (current) — the core bug:

```ts
  private timesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };
    return (
      toMinutes(start1) < toMinutes(end2) && toMinutes(end1) > toMinutes(start2)
    );
  }
```

With `22:00→06:00`: `start = 1320`, `end = 360`. Against `05:00→09:00` the test reads `1320 < 540 && 360 > 300` → `false && true` → **false**, on the same date. Six call sites: `:547` (survivor coverage), `:900` (special-day clamp — the ONLY non-double-booking one, keeps today's semantics as `windowsOverlap`), `:1148` (eligibility → greedy + repair + replay), `:2381` (`moveShift`), `:2503` (`createManualShift`), `:2759` (`preValidateMove`).

`apps/api/src/modules/planning/planning-generation.service.ts:1143-1157` (current) — same-date bucket:

```ts
    // 2) Time overlap with an existing assignment on the same date
    const existingOnDate =
      ctx.assignmentIndex.get(`${emp.id}|${slot.date}`) || [];
    for (const existing of existingOnDate) {
      if (
        this.timesOverlap(
          slot.startTime,
          slot.endTime,
          existing.startTime,
          existing.endTime,
        )
      ) {
        return { eligible: false, blockedOnlyByRotation: false };
      }
    }
```

`apps/api/src/modules/planning/planning-generation.service.ts:1196-1221` (current) — the AC-4 bug (`24*60 - prev.endTime + slot.startTime` credits a whole extra day when `prev` wraps):

```ts
      const minRest = config.minRestHoursBetweenShifts as number | undefined;
      if (minRest) {
        const minRestMin = minRest * 60;
        const prevDate = this.getPreviousDate(slot.date);
        const prevShifts =
          ctx.assignmentIndex.get(`${emp.id}|${prevDate}`) || [];
        for (const prev of prevShifts) {
          const rest =
            24 * 60 -
            this.toMinutes(prev.endTime) +
            this.toMinutes(slot.startTime);
          if (rest < minRestMin)
            return { eligible: false, blockedOnlyByRotation: false };
        }
        const nextDate = this.getNextDate(slot.date);
        const nextShifts =
          ctx.assignmentIndex.get(`${emp.id}|${nextDate}`) || [];
        for (const next of nextShifts) {
          const rest =
            24 * 60 -
            this.toMinutes(slot.endTime) +
            this.toMinutes(next.startTime);
          if (rest < minRestMin)
            return { eligible: false, blockedOnlyByRotation: false };
        }
      }
```

`apps/api/src/modules/planning/solver-model.ts:146-160` (current) — AC-2 and AC-6:

```ts
function overlaps(a: SolverSlot, b: SolverSlot): boolean {
  if (a.date !== b.date) return false;
  return (
    toMin(a.startTime) < toMin(b.endTime) &&
    toMin(b.startTime) < toMin(a.endTime)
  );
}

function amplitudeExceeded(a: SolverSlot, b: SolverSlot): boolean {
  if (a.date !== b.date) return false;
  const span =
    Math.max(toMin(a.endTime), toMin(b.endTime)) -
    Math.min(toMin(a.startTime), toMin(b.startTime));
  return span > STATUTORY_AMPLITUDE_MINUTES;
}
```

`apps/api/src/modules/planning/french-labor-law.ts:140-159` (current) — the reference implementation the primitive is extracted from:

```ts
function mergedBusyIntervals(
  shifts: StatutoryShift[],
): Array<[number, number]> {
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
```

`packages/validators/src/clinic/onboarding.schema.ts:61-64` (current) — AC-5 blocker #1:

```ts
export const shiftTypeSchema = shiftTypeFieldsSchema.refine(
  (data) => data.endTime > data.startTime,
  { message: 'End time must be after start time', path: ['endTime'] }
);
```

`packages/validators/src/clinic/shift-type.schema.ts:4-7` (current) — AC-5 blocker #2:

```ts
export const createShiftTypeSchema = shiftTypeFieldsSchema.refine(
  (data) => data.endTime > data.startTime,
  { message: "End time must be after start time", path: ["endTime"] },
);
```

`apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx:42-49` (current) — AC-5 blocker #3:

```ts
            const hasIncomplete = value.some(
              (st) =>
                !st.name?.trim() ||
                !st.code?.trim() ||
                !/^\d{2}:\d{2}$/.test(st.startTime) ||
                !/^\d{2}:\d{2}$/.test(st.endTime) ||
                st.endTime <= st.startTime
            );
```

`apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx:201-213` (current) — AC-5 blocker #4 (case 2 is the shift-type gate; case 1 above it is the `is24_7` opening-hours gate and stays):

```ts
      case 2:
        return (
          values.shiftTypes.length >= 1 &&
          values.shiftTypes.every(
            (st) =>
              st.name.length > 0 &&
              st.code.length > 0 &&
              /^\d{2}:\d{2}$/.test(st.startTime) &&
              /^\d{2}:\d{2}$/.test(st.endTime) &&
              st.endTime > st.startTime &&
              /^#[0-9A-Fa-f]{6}$/.test(st.color)
          )
        );
```

`apps/api/src/modules/planning/planning-generation.service.ts:79-86` (current) — the shape the primitive must accept structurally:

```ts
type AssignedShift = {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftTypeCode: string;
  breakMinutes?: number;
};
```

### File decisions (3-bullet per file)

**`apps/api/src/modules/planning/shift-interval.ts`** (new)
- *Responsibility:* turn a `(date, HH:MM)` shift into an absolute minute interval, and answer overlap / rest-gap questions on those intervals.
- *Inputs:* nothing — zero imports, pure functions.
- *Outputs:* `IntervalShift`, `AbsoluteInterval`, `toAbsoluteInterval`, `intervalsOverlap`, `shiftsOverlap`, `restMinutesBetween`. Consumed by `planning-generation.service.ts`, `solver-model.ts`, `french-labor-law.ts`.

**`apps/api/src/modules/planning/shift-interval.spec.ts`** (new)
- *Responsibility:* pin the wrap convention (including `end === start` = zero-length) and the junction / month-frontier edges.
- *Inputs:* `./shift-interval`.
- *Outputs:* Jest suite, 17 tests.

**`apps/api/src/modules/planning/planning-generation.service.ts`** (modify)
- *Responsibility:* unchanged — monthly generation, eligibility, manual writes. This story only changes how it asks "do these two shifts overlap" and "how much rest is between them".
- *Inputs:* adds `shiftsOverlap`, `restMinutesBetween` from `./shift-interval`.
- *Outputs:* unchanged public surface. `timesOverlap` → `windowsOverlap` (special-day clamp only); new private `adjacentDayRange`.

**`apps/api/src/modules/planning/solver-model.ts`** (modify)
- *Responsibility:* unchanged — pure CP-SAT IR builder. Stays package-agnostic: it imports the primitive, never the statutory module.
- *Inputs:* adds `intervalsOverlap`, `toAbsoluteInterval`, `AbsoluteInterval` from `./shift-interval`.
- *Outputs:* same IR, same constraint tags — plus the mutexes that were silently missing.

**`apps/api/src/modules/planning/french-labor-law.ts`** (modify)
- *Responsibility:* unchanged — statutory limits. Stops owning a private copy of the wrap rule.
- *Inputs:* adds `toAbsoluteInterval` from `./shift-interval`.
- *Outputs:* identical behaviour; the 11-3 suite is the proof.

**`packages/validators/src/clinic/{onboarding,shift-type}.schema.ts`** (modify)
- *Responsibility:* unchanged — shape validation. The shift-type time rule goes from "end after start" to "end differs from start".
- *Inputs / Outputs:* unchanged exports. Opening hours and special days are NOT touched.

**`apps/web/.../onboarding/_components/{StepShiftTypes,OnboardingWizard}.tsx`** (modify)
- *Responsibility:* unchanged. Two hard-coded mirrors of the Zod rule, realigned.
- *Inputs / Outputs:* unchanged. No new i18n key: `StepShiftTypes` reuses `incompleteShiftType`.

### Testing

- **API:** Jest, `*.spec.ts`, `rootDir: src`. Run one file with `pnpm --filter @pawly/api test <pattern>`; never `cd apps/api`, never bare root `pnpm test` (rtk shim breaks the root runner — project memory).
- **Validators:** Vitest, `*.test.ts` in `packages/validators` — `pnpm --filter @pawly/validators test`.
- **How this suite drives private methods.** `planning-generation.service.spec.ts` never constructs the service inline and never calls `evaluateEligibility` directly: it goes through `callPrivate('scoreAndAssign', ...)` wrapped by the `callScore(slot, employees, constraints, alreadyAssigned, assignmentIndex, employeeMinutes, weeksInMonth?)` helper, asserting on `result.assigned` / `result.holeInfo`. `solver-model.spec.ts` uses its `emp()` / `slot()` / `baseInput()` factories. Tasks 4, 6, 8 and 10 follow those shapes — do not invent a new harness.
- **Statutory law can mask the bug in a fixture (read before designing any new case).** The statutory block runs right after the overlap block in `evaluateEligibility`, so a fixture that is too aggressive gets rejected by 11-3 and the test passes *before* the fix — a false green. Concretely: two same-date shifts where one wraps (e.g. `22:00→06:00` + `05:00→09:00` on day D) produce a 25h day amplitude and are already blocked today. That is why **the same-date wrap case is pinned in `shift-interval.spec.ts` (Task 1), not through `callScore`** — the primitive is where it is observable. Adjacent-day fixtures (Task 4) and sub-10h overnight neighbours (Task 8) stay clear of the statutory net and are genuinely RED.
- **`callScore` computes negative minutes for a wrapping shift.** Its local `netMin` helper is `toMin(end) - toMin(start)` with no wrap, so an overnight entry in `alreadyAssigned` feeds a negative weekly counter. Harmless for these tests (a negative counter can never trip a cap, and overlap is checked before counters) but do not be surprised by it while debugging, and do not "fix" the spec helper as part of this story.
- **Mock hazard (Epic 11 lesson, hit by every generation spec):** `mockPrismaService.shift.findMany` is shared between the overlap query, the statutory-window query and `loadBorderWeekShifts` — one `mockResolvedValue` feeds them all (see the 11-3 test at `:5267`). Task 9 changes the overlap query's `where.date` from a scalar to `{ in: [...] }`, making it resemble the border query; where a test needs to distinguish them, key the mock on the `where` predicate shape rather than call order, as the existing tests at `:1633`, `:1896`, `:6110` do.
- **Not covered by automated tests:** the two front guards (Tasks 13c/13d). No spec exists for the onboarding wizard, and standing one up for two boolean conditions is out of proportion here; Zod is the real net and it IS covered (Task 12). Verify by hand in the L2 journey at review: onboarding → step "Shift types" → define `22:00 → 06:00` → the Next button must enable and the wizard must complete.

### Dependencies

None added. No Prisma migration, no Trigger.dev task change, no new package. `or-tools-wasm` is untouched (the IR changes, not the adapter).

### Known gaps deliberately left (report, do not fix here)

- `Planning.prisma` `@@unique([employeeId, date, startTime])` is a calendar-date uniqueness guard, blind to the wrap. Out of scope; no migration in this story.
- `evaluateEligibility`'s minRest checks only D-1 / D+1 neighbours, never same-day ones. Pre-existing; Task 7 keeps that scope and only fixes the arithmetic.
- Survivor coverage (`:547`) stays keyed on `date|shiftTypeCode`, so a D-1 overnight survivor never "covers" a D slot. Widening it would change 11-2 semantics and risk under-generation; double-booking is caught by `evaluateEligibility` anyway.
- `rule-engine.ts:16` carries the same wrong `<=` header comment as `french-labor-law.ts:17`.

### Out of scope (deferred to a separate UX story, decided with Alex)

- A "+1 day" indicator on `ShiftCell.tsx` / `ShiftDayCard.tsx`: an overnight shift renders only under day D, so neither the admin grid nor the employee timeline signals that the person is busy until 06:00 on D+1. This is a real "System Never Lies" gap — it is deferred, not dismissed.
- Server-side validation errors are never surfaced in `ShiftTypeFormSheet` (it has no client validator and no message dictionary, unlike `ClinicOperationalConfigPanel.tsx:125-131`). Pre-existing gap, unchanged by this story.
- A `settings.shiftTypes.validation` i18n namespace (does not exist today in `fr.json` / `en.json`).

### Coordination

Story 13-1 (KON-131) runs in the same wave and also edits `moveShift` / `createManualShift` — it adds statutory + rule-engine guards and a shared advisory lock, while this story changes their overlap query and loop. Different lines, but expect a mechanical merge conflict in `planning-generation.service.ts`. Whoever merges second re-runs `pnpm --filter @pawly/api test`.

### Commit prefix

`feat(KON-132): ...` / `test(KON-132): ...` / `refactor(KON-132): ...`. Stage explicit paths — never `git add .`.

## File List

- `apps/api/src/modules/planning/shift-interval.ts` (new)
- `apps/api/src/modules/planning/shift-interval.spec.ts` (new)
- `apps/api/src/modules/planning/planning-generation.service.ts` (modify)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` (modify)
- `apps/api/src/modules/planning/solver-model.ts` (modify)
- `apps/api/src/modules/planning/solver-model.spec.ts` (modify)
- `apps/api/src/modules/planning/french-labor-law.ts` (modify)
- `packages/validators/src/clinic/onboarding.schema.ts` (modify)
- `packages/validators/src/clinic/onboarding.schema.test.ts` (modify)
- `packages/validators/src/clinic/shift-type.schema.ts` (modify)
- `packages/validators/src/clinic/shift-type.schema.test.ts` (modify)
- `apps/web/src/app/[locale]/admin/onboarding/_components/steps/StepShiftTypes.tsx` (modify)
- `apps/web/src/app/[locale]/admin/onboarding/_components/OnboardingWizard.tsx` (modify)

## Dev Agent Record

- **Model:** _(set by aped-dev)_
- **Started:** _(set by aped-dev)_
- **Completed:** _(set by aped-dev)_

### Summary

### Files changed

### Deviations

### Test output

## Review Record

### Findings

### Verification
