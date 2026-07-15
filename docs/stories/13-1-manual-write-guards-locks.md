# Story: 13-1-manual-write-guards-locks — Manual-Write Guards & Shared Locks

**Epic:** Epic 13 — Planning Integrity & Solver Fidelity
**Status:** ready-for-dev
**Branch:** feature/KON-131-13-1-manual-write-guards-locks
**Ticket:** KON-131 (Linear · project Pawly · milestone Epic 13 · Urgent · blocks KON-134 / 13-2)
**Origin:** Multi-agent planning audit 2026-07-14, findings **T1** + **T2** (triage `docs/triage-decision.md`, both hand-verified line-by-line during authoring). T1: *"`moveShift` persists without any statutory or rule-engine guard — the check is client-only via `preValidateMove`."* T2: *"manual writes take no advisory lock while a generation computes outside its transaction → double-booking is persistable."* This story is Wave W1 (no deps) and **unblocks 13-2** (unified validation windows).

> **Read first:** `docs/epics-context/epic-13-context.md` — audit synthesis, file:line anchors (§4), and the cross-cutting invariants every Epic 13 story MUST preserve (§3). `aped-dev` / `aped-review` load it automatically. Line numbers below were re-verified against this worktree during authoring (`planning-generation.service.ts` = 4948 lines); **re-locate the symbol, do not trust the number blindly.**

## User Story

**As an** admin user, **I want** manual shift moves and creations to enforce the same statutory and HARD rules as generation, atomically and under the same lock, **so that** no manual gesture or concurrent write can ever persist an illegal or double-booked roster.

## Acceptance Criteria

1. **AC1 — Server-side move guard.** **Given** a move that would introduce a statutory or HARD-rule violation, **When** `planning.moveShift` is called — from the grid **or from any client hitting the API directly** — **Then** the mutation is rejected server-side by replaying `wouldExceedStatutory` + the unified rule engine **inside the mutation transaction**, and no `shift.update` is persisted. `preValidateMove` keeps its exact `{ hard, soft }` contract and becomes advisory UX only — no longer the only line of defense.
2. **AC2 — Published month, no premature notification.** **Given** a month whose `PlanningPeriodStatus` is `PUBLISHED`, **When** an acknowledged amendment would violate a statutory limit, **Then** it is rejected before any employee notification is sent and before any amendment is recorded (`sendScheduleChangedEmail` and `planningPeriodStatus.updateMany` are never called).
3. **AC3 — Shared lock.** **Given** concurrent writes on the same clinic-month, **When** `moveShift`, `createManualShift`, or `generateMonthlyPlan` run, **Then** all three serialize on the same `pg_advisory_xact_lock(hashtext(clinicId), hashtext(month))`, taken as the first statement inside the write transaction. A cross-month move locks **both** months in **sorted** order.
4. **AC4 — TOCTOU closed.** **Given** a plan computed on a snapshot that a concurrent manual write has since invalidated, **When** `generateMonthlyPlan` reaches its write transaction, **Then** it re-validates the computed plan against current DB state under the lock (overlap + survivor re-check) and rejects with `STALE_PLAN_REGENERATE` rather than persisting a double-booking.
5. **AC5 — Regressions.** **Given** the audit's two scenarios, **When** the suite runs, **Then** a direct-API illegal move is rejected, and a move racing a regeneration never yields overlapping shifts.

**FRs covered:** FR6 (drag-and-drop adjustment), FR7 (Hard Rules block conflicting shifts). **NFRs:** NFR3 (zero silent failures — an illegal write is refused loudly, never silently accepted), NFR10 (concurrent generations handled safely).

> **Mechanism map (AC → surface, realized in Tasks):**
> AC1 → new pure `move-validation.ts` (Task 1) + `loadMoveValidationInputs` (Task 3) + `moveShift` rewritten around a single transaction (Task 4). AC2 → same transaction: the guard throws before `recordAmendment`, and `notifyScheduleChange` already fires post-commit (:2427) so a rollback can never notify (Task 4, asserted in Task 8). AC3 → `lockMonths` helper (Task 4) reused by `createManualShift` (Task 5); generation (:747) and publish (:3048) already take the same key — unchanged. AC4 → in-transaction re-validation in `generateMonthlyPlan` (Task 6). AC5 → Tasks 7 + 9.

> **Scope decisions locked with Alex during authoring (GATE step-04):**
> - **Statutory window = ±8 real days**, not the strict month. `createManualShift` (:2519-2529) already uses ±8 real days and the audit calls it *"the correct reference"*; `preValidateMove` uses `monthShifts` (:2871-2877), which is audit finding **T4**. Shipping the new write-path guard on a knowingly-wrong window would mean an AC1 that claims to block illegal moves while letting month-frontier breaches through. The shared evaluator therefore uses ±8 days from day one, and `preValidateMove` inherits the fix as a byproduct. **13-2 still owns**: the publish path (`validateShiftsAgainstRules` → `planning.service.ts:178-182`), generation/replay eligibility, `clampGapLen` phantom rest (`french-labor-law.ts:200-204`), and the Dec→Jan ISO-week tests.
> - **The evaluator is a pure module**, `move-validation.ts` — not a private service method. It follows 11-8's stated ideal (*"extracted with the pure algorithm core"*), is unit-testable with zero Prisma mocks, and gives 13-2 exactly one window knob to turn. Cost: `preValidateMove` is refactored onto it; its existing tests are the safety net and must stay green **unmodified**.
> - **Stale plan → reject.** `generateMonthlyPlan` throws `ConflictException('STALE_PLAN_REGENERATE')` rather than dropping the conflicting assignments. Generation is idempotent and retriable since 11-5, and rejecting is the NFR3-honest option; the drop-and-report-as-holes variant would require recomputing holes/violations to avoid lying, which is 13-6's territory.
> - **No web changes.** `useShiftMutations.ts:36-54` already snapshots, rolls back on error, and raises `toast.error(t('moveError'), { description: err.message })`. A rejected move snaps back with the message — the UX spec's contract (`docs/ux/flows.md`: *"Optimistic UI … if the server rejects the move (rare), it snaps back with an error toast"*) already holds. The message stays the raw English `ConflictException` string, exactly like `createManualShift` today; localized `messageKey` plumbing (11-3) covers Health Bar violations only and is out of scope here.

## Tasks

- [ ] **Task 1: Create the pure move evaluator `move-validation.ts`** [AC: 1]
  Create `apps/api/src/modules/planning/move-validation.ts` with the full contents below. Pure module — no NestJS, no Prisma, no I/O. It reuses `netMinutes` / `isoWeekday` from `rule-engine.ts` and `wouldExceedStatutory` from `french-labor-law.ts` rather than re-deriving them.
  ```ts
  /**
   * Manual-move validation — Story 13-1 (KON-131).
   *
   * Pure evaluator for a manual shift move. Zero I/O: every input is loaded by the caller
   * (`PlanningGenerationService.loadMoveValidationInputs`) and handed in, so the SAME decision
   * can be replayed against `this.prisma` (advisory `preValidateMove`, UX) or against the write
   * transaction's `tx` (`moveShift`, enforcement) with no risk of the two drifting apart.
   * Audit 2026-07-14 finding T1 exists precisely because they were two separate
   * implementations and only the advisory one was ever written.
   *
   * Conventions inherited from the module: dates are `YYYY-MM-DD` interpreted UTC, times are
   * `HH:MM` minute arithmetic, statutory limits are non-disableable and evaluated
   * INDEPENDENTLY of any configured PlanningRule (invariant 11-3 / epic-13 context §3.4).
   */
  import type { MoveValidationResult } from '@pawly/validators';
  import { wouldExceedStatutory, type StatutoryShift } from './french-labor-law';
  import {
    netMinutes,
    isoWeekday,
    violatesHardContractIncremental,
    violatesHardRotation,
    type RuleType,
  } from './rule-engine';

  /** The subset of a Prisma `Shift` row the move decision reads. */
  export type MoveEvalShift = {
    id: string;
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    shiftTypeCode: string;
  };

  export type MoveEvalEmployee = {
    id: string;
    firstName: string;
    lastName: string;
    jobType: string;
    contractHours: number;
  };

  export type MoveEvalRule = {
    id: string;
    name: string;
    ruleType: RuleType;
    category: string;
    config: Record<string, unknown>;
  };

  export type MoveEvalUnavailability = {
    type: string;
    reason?: string | null;
    daysOfWeek: number[];
  };

  export type MoveEvalContext = {
    /** The shift being moved, at its CURRENT position. */
    shift: MoveEvalShift;
    /** Resolved target — the caller falls back to the shift's own employee/date on a partial move. */
    target: { employeeId: string; date: string };
    /** Target employee; `null` => not found or inactive. */
    employee: MoveEvalEmployee | null;
    operationalConfig: {
      workDays: string[];
      closedDays: Array<{ date: string }>;
    };
    unavailabilities: MoveEvalUnavailability[];
    /** Target employee's shifts on the target DATE, excluding the moved shift. */
    sameDayShifts: MoveEvalShift[];
    /** Target employee's shifts in the target ISO week, excluding the moved shift. */
    weekShifts: MoveEvalShift[];
    /** Target employee's shifts in the target MONTH, excluding the moved shift (rotation pool). */
    monthShifts: MoveEvalShift[];
    /** Quarter-but-not-month shifts, excluding the moved shift. Empty unless a quarterly rotation rule exists. */
    quarterExtraShifts: MoveEvalShift[];
    /** Target employee's shifts in the +/-8 real-day statutory window, excluding the moved shift. */
    statutoryWindowShifts: MoveEvalShift[];
    rules: MoveEvalRule[];
  };

  /** ClinicConfig.workDays is stored as day NAMES (['MONDAY', ...]) — see updateWorkDaysSchema. */
  const DAY_NAME_TO_ISO: Record<string, number> = {
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
    SUNDAY: 7,
  };

  /** ROTATION_EQUITY rule config uses lowercase day names. */
  const ROTATION_DAY_TO_ISO: Record<string, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };

  function toMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Same-day time overlap. Deliberately NOT wrap-aware — this is a verbatim port of
   * `PlanningGenerationService.timesOverlap` (:3565-3578). Cross-midnight overlap is audit
   * finding T3 and belongs to story 13-3; fixing it here would silently widen this story's
   * blast radius and break 13-3's "same-date behaviour unchanged" regression baseline.
   */
  export function timesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean {
    return (
      toMinutes(start1) < toMinutes(end2) && toMinutes(end1) > toMinutes(start2)
    );
  }

  function toStatutoryShift(s: MoveEvalShift): StatutoryShift {
    return {
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: s.breakMinutes,
    };
  }

  /**
   * Evaluates a move and returns its HARD (blocking) and SOFT (warning) violations.
   * Callers decide what to do: `preValidateMove` returns them for drop feedback,
   * `moveShift` throws when `hard` is non-empty.
   */
  export function evaluateMoveViolations(
    ctx: MoveEvalContext,
  ): MoveValidationResult {
    const hard: Array<{ rule: string; message: string }> = [];
    const soft: Array<{ rule: string; message: string }> = [];

    if (!ctx.employee) {
      hard.push({
        rule: 'EMPLOYEE',
        message: 'Target employee not found or inactive',
      });
      return { hard, soft };
    }
    const employee = ctx.employee;
    const targetDate = ctx.target.date;
    const targetIsoDay = isoWeekday(targetDate);

    // Closed / non-work day
    const workDaySet = new Set(
      ctx.operationalConfig.workDays
        .map((d) => DAY_NAME_TO_ISO[d])
        .filter(Boolean),
    );
    const closedDateSet = new Set(
      ctx.operationalConfig.closedDays.map((cd) => cd.date),
    );
    if (closedDateSet.has(targetDate)) {
      hard.push({ rule: 'CLOSED_DAY', message: 'Target date is a closed day' });
    }
    if (!workDaySet.has(targetIsoDay)) {
      hard.push({
        rule: 'NON_WORK_DAY',
        message: 'Target date is not a work day',
      });
    }

    // Unavailabilities
    for (const ua of ctx.unavailabilities) {
      if (ua.daysOfWeek.length === 0) {
        hard.push({
          rule: 'UNAVAILABILITY',
          message: `Employee is unavailable (${ua.type}${ua.reason ? ': ' + ua.reason : ''})`,
        });
      } else if (ua.daysOfWeek.includes(targetIsoDay)) {
        hard.push({
          rule: 'UNAVAILABILITY',
          message: `Employee has recurring unavailability on this day (${ua.type})`,
        });
      }
    }

    // Time overlap on the target employee + date
    for (const existing of ctx.sameDayShifts) {
      if (
        timesOverlap(
          ctx.shift.startTime,
          ctx.shift.endTime,
          existing.startTime,
          existing.endTime,
        )
      ) {
        hard.push({
          rule: 'OVERLAP',
          message: `Shift overlaps with existing shift (${existing.startTime}-${existing.endTime})`,
        });
        break;
      }
    }

    // HARD SKILL_REQUIREMENT
    for (const rule of ctx.rules.filter(
      (r) => r.ruleType === 'HARD' && r.category === 'SKILL_REQUIREMENT',
    )) {
      if (rule.config.shiftTypeCode === ctx.shift.shiftTypeCode) {
        const requiredJobTypes = rule.config.requiredJobTypes as
          | string[]
          | undefined;
        if (requiredJobTypes && !requiredJobTypes.includes(employee.jobType)) {
          hard.push({
            rule: 'SKILL_REQUIREMENT',
            message: `Employee job type ${employee.jobType} does not match required: ${requiredJobTypes.join(', ')}`,
          });
        }
      }
    }

    // CONTRACT_COMPLIANCE — respects HARD vs SOFT ruleType. maxMonthlyHours is stripped so
    // only the weekly cap is evaluated, matching the move's historic weekly-only semantics
    // (Story 11-8 decision, preserved verbatim).
    const shiftMinutes = netMinutes(
      ctx.shift.startTime,
      ctx.shift.endTime,
      ctx.shift.breakMinutes,
    );
    let weeklyMinutes = 0;
    for (const ws of ctx.weekShifts) {
      weeklyMinutes += netMinutes(ws.startTime, ws.endTime, ws.breakMinutes);
    }
    const projectedWeeklyMinutes = weeklyMinutes + shiftMinutes;
    const projectedWeeklyHours =
      Math.round((projectedWeeklyMinutes / 60) * 10) / 10;
    const contractWeeklyMinutes = employee.contractHours * 60;

    const contractRules = ctx.rules.filter(
      (r) => r.category === 'CONTRACT_COMPLIANCE',
    );
    for (const rule of contractRules) {
      const maxWeekly = rule.config.maxWeeklyHours as number | undefined;
      const effectiveLimit = maxWeekly
        ? Math.min(employee.contractHours, maxWeekly)
        : employee.contractHours;
      if (
        violatesHardContractIncremental(
          {
            id: rule.id,
            name: rule.name,
            ruleType: rule.ruleType,
            category: rule.category,
            config: { ...rule.config, maxMonthlyHours: undefined },
          },
          {
            weekMinutes: weeklyMinutes,
            monthMinutes: 0,
            candidateMinutes: shiftMinutes,
            contractHours: employee.contractHours,
          },
        )
      ) {
        const bucket = rule.ruleType === 'HARD' ? hard : soft;
        bucket.push({
          rule: 'CONTRACT_COMPLIANCE',
          message: `Overtime risk: ${projectedWeeklyHours}h this week, effective limit ${effectiveLimit}h`,
        });
        break;
      }
    }

    // No contract rules configured — still warn based on contractHours
    if (
      contractRules.length === 0 &&
      projectedWeeklyMinutes > contractWeeklyMinutes
    ) {
      soft.push({
        rule: 'CONTRACT_COMPLIANCE',
        message: `Overtime risk: ${projectedWeeklyHours}h this week, contract limit ${employee.contractHours}h`,
      });
    }

    // ROTATION_EQUITY
    for (const rule of ctx.rules.filter(
      (r) => r.category === 'ROTATION_EQUITY',
    )) {
      const targetDay = rule.config.targetDay as string;
      const maxPerPeriod = rule.config.maxPerPeriod as number;
      const trackingPeriod = rule.config.trackingPeriod as string | undefined;
      const ruleDayIso = ROTATION_DAY_TO_ISO[targetDay];
      if (!ruleDayIso || ruleDayIso !== targetIsoDay) continue;

      const applicableJobTypes = rule.config.applicableJobTypes as
        | string[]
        | undefined;
      if (
        applicableJobTypes &&
        applicableJobTypes.length > 0 &&
        !applicableJobTypes.includes(employee.jobType)
      ) {
        continue;
      }

      const shiftPool =
        trackingPeriod === 'quarterly'
          ? [...ctx.monthShifts, ...ctx.quarterExtraShifts]
          : ctx.monthShifts;
      const targetDayCount = shiftPool.filter(
        (s) => isoWeekday(s.date) === ruleDayIso,
      ).length;

      if (
        violatesHardRotation(
          {
            id: rule.id,
            name: rule.name,
            ruleType: rule.ruleType,
            category: rule.category,
            config: rule.config,
          },
          { currentCount: targetDayCount, jobType: employee.jobType },
        )
      ) {
        const bucket = rule.ruleType === 'HARD' ? hard : soft;
        bucket.push({
          rule: 'ROTATION_EQUITY',
          message: `${employee.firstName} ${employee.lastName} — would be ${targetDayCount + 1}th ${targetDay} this ${trackingPeriod || 'month'} (max ${maxPerPeriod})`,
        });
      }
    }

    // Statutory (Story 11-3) — non-disableable, evaluated on the +/-8 real-day window.
    // Story 13-1 widened this from the strict month (audit T4's move arm).
    const breaches = wouldExceedStatutory(
      ctx.statutoryWindowShifts.map(toStatutoryShift),
      {
        date: targetDate,
        startTime: ctx.shift.startTime,
        endTime: ctx.shift.endTime,
        breakMinutes: ctx.shift.breakMinutes,
      },
    );
    for (const kind of breaches) {
      hard.push({
        rule: 'CONTRACT_COMPLIANCE',
        message: `Statutory limit exceeded: ${kind}`,
      });
    }

    return { hard, soft };
  }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no error lines referencing `move-validation.ts`, exit 0.
  Commit: `git add apps/api/src/modules/planning/move-validation.ts && git commit -m "feat(KON-131): pure move evaluator shared by the advisory and write paths"`

- [ ] **Task 2: Unit-test the pure evaluator** [AC: 1]
  Create `apps/api/src/modules/planning/move-validation.spec.ts` with the full contents below. Zero Prisma mocks — this is the point of Task 1.
  ```ts
  import {
    evaluateMoveViolations,
    timesOverlap,
    type MoveEvalContext,
    type MoveEvalShift,
  } from './move-validation';

  const shiftAt = (
    date: string,
    startTime: string,
    endTime: string,
    overrides: Partial<MoveEvalShift> = {},
  ): MoveEvalShift => ({
    id: `s-${date}-${startTime}`,
    employeeId: 'emp-2',
    date,
    startTime,
    endTime,
    breakMinutes: 0,
    shiftTypeCode: 'SURGERY',
    ...overrides,
  });

  // 2026-03-02 is a Monday, 2026-03-07 a Saturday.
  const baseCtx = (overrides: Partial<MoveEvalContext> = {}): MoveEvalContext => ({
    shift: shiftAt('2026-03-02', '08:00', '12:00', { id: 'shift-1', employeeId: 'emp-1' }),
    target: { employeeId: 'emp-2', date: '2026-03-02' },
    employee: {
      id: 'emp-2',
      firstName: 'Bob',
      lastName: 'Dupont',
      jobType: 'ASV',
      contractHours: 35,
    },
    operationalConfig: {
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      closedDays: [],
    },
    unavailabilities: [],
    sameDayShifts: [],
    weekShifts: [],
    monthShifts: [],
    quarterExtraShifts: [],
    statutoryWindowShifts: [],
    rules: [],
    ...overrides,
  });

  describe('timesOverlap', () => {
    it('detects an overlap on the same day', () => {
      expect(timesOverlap('08:00', '12:00', '10:00', '14:00')).toBe(true);
    });

    it('treats back-to-back shifts as non-overlapping', () => {
      expect(timesOverlap('08:00', '12:00', '12:00', '18:00')).toBe(false);
    });
  });

  describe('evaluateMoveViolations', () => {
    it('returns no violations for a clean move', () => {
      const result = evaluateMoveViolations(baseCtx());
      expect(result.hard).toHaveLength(0);
      expect(result.soft).toHaveLength(0);
    });

    it('short-circuits with HARD EMPLOYEE when the target employee is missing', () => {
      const result = evaluateMoveViolations(baseCtx({ employee: null }));
      expect(result.hard).toEqual([
        { rule: 'EMPLOYEE', message: 'Target employee not found or inactive' },
      ]);
    });

    it('flags HARD NON_WORK_DAY when the target day is outside workDays', () => {
      const result = evaluateMoveViolations(
        baseCtx({ target: { employeeId: 'emp-2', date: '2026-03-07' } }),
      );
      expect(result.hard).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: 'NON_WORK_DAY' })]),
      );
    });

    it('flags HARD CLOSED_DAY when the target date is closed', () => {
      const result = evaluateMoveViolations(
        baseCtx({
          operationalConfig: {
            workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
            closedDays: [{ date: '2026-03-02' }],
          },
        }),
      );
      expect(result.hard).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: 'CLOSED_DAY' })]),
      );
    });

    it('flags HARD UNAVAILABILITY for a full-period unavailability', () => {
      const result = evaluateMoveViolations(
        baseCtx({
          unavailabilities: [{ type: 'VACATION', reason: null, daysOfWeek: [] }],
        }),
      );
      expect(result.hard).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: 'UNAVAILABILITY' })]),
      );
    });

    it('flags HARD OVERLAP against an existing shift on the target date', () => {
      const result = evaluateMoveViolations(
        baseCtx({ sameDayShifts: [shiftAt('2026-03-02', '10:00', '14:00')] }),
      );
      expect(result.hard).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: 'OVERLAP',
            message: 'Shift overlaps with existing shift (10:00-14:00)',
          }),
        ]),
      );
    });

    it('flags HARD DAILY_WORK when the move pushes the day past the 10h statutory limit', () => {
      // 13:00-20:00 (7h) already held + the moved 08:00-12:00 (4h) = 11h > 10h.
      // Amplitude 08:00->20:00 = 12h stays under the 13h limit, so DAILY_WORK fires alone.
      const result = evaluateMoveViolations(
        baseCtx({ statutoryWindowShifts: [shiftAt('2026-03-02', '13:00', '20:00')] }),
      );
      expect(result.hard).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: 'CONTRACT_COMPLIANCE',
            message: 'Statutory limit exceeded: DAILY_WORK',
          }),
        ]),
      );
    });

    it('sees a statutory breach that straddles the month frontier (the +/-8 day window)', () => {
      // Move onto Mon 2026-03-02, with Feb 24..Mar 01 already worked => a 7th consecutive day.
      const worked = [
        '2026-02-24',
        '2026-02-25',
        '2026-02-26',
        '2026-02-27',
        '2026-02-28',
        '2026-03-01',
      ].map((d) => shiftAt(d, '08:00', '12:00'));
      const result = evaluateMoveViolations(
        baseCtx({ statutoryWindowShifts: worked }),
      );
      expect(result.hard).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Statutory limit exceeded: CONSECUTIVE_DAYS',
          }),
        ]),
      );
    });

    it('routes a SOFT contract rule to soft and a HARD one to hard', () => {
      const week = [
        shiftAt('2026-03-03', '08:00', '18:00'),
        shiftAt('2026-03-04', '08:00', '18:00'),
        shiftAt('2026-03-05', '08:00', '18:00'),
        shiftAt('2026-03-06', '08:00', '18:00'),
      ];
      const rule = {
        id: 'r-1',
        name: 'Weekly cap',
        category: 'CONTRACT_COMPLIANCE',
        config: { maxWeeklyHours: 35 },
      };
      const soft = evaluateMoveViolations(
        baseCtx({ weekShifts: week, rules: [{ ...rule, ruleType: 'SOFT' as const }] }),
      );
      expect(soft.soft).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: 'CONTRACT_COMPLIANCE' })]),
      );
      expect(soft.hard).toHaveLength(0);

      const hard = evaluateMoveViolations(
        baseCtx({ weekShifts: week, rules: [{ ...rule, ruleType: 'HARD' as const }] }),
      );
      expect(hard.hard).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: 'CONTRACT_COMPLIANCE' })]),
      );
    });

    it('counts quarterly rotation across the quarter pool, monthly across the month only', () => {
      const rule = {
        id: 'r-2',
        name: 'Saturday rotation',
        ruleType: 'HARD' as const,
        category: 'ROTATION_EQUITY',
        config: { targetDay: 'saturday', maxPerPeriod: 2, trackingPeriod: 'quarterly' },
      };
      // Target Saturday 2026-03-07; 1 Saturday this month + 1 earlier in the quarter = 2 => cap reached.
      const result = evaluateMoveViolations(
        baseCtx({
          target: { employeeId: 'emp-2', date: '2026-03-07' },
          operationalConfig: {
            workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
            closedDays: [],
          },
          monthShifts: [shiftAt('2026-03-14', '08:00', '12:00')],
          quarterExtraShifts: [shiftAt('2026-01-10', '08:00', '12:00')],
          rules: [rule],
        }),
      );
      expect(result.hard).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: 'ROTATION_EQUITY' })]),
      );
    });
  });
  ```
  Run: `pnpm --filter @pawly/api test -- move-validation`
  Expected: `Tests:` all passed (12 passing), exit 0.
  Commit: `git add apps/api/src/modules/planning/move-validation.spec.ts && git commit -m "test(KON-131): unit-test the pure move evaluator"`

- [ ] **Task 3: Add `loadMoveValidationInputs` and rewire `preValidateMove` onto it** [AC: 1]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, add the import below to the existing `./rule-engine` import block area (keep `violatesHardContractIncremental` / `violatesHardRotation` imported — they are still used by the generation path):
  ```ts
  import {
    evaluateMoveViolations,
    type MoveEvalContext,
    type MoveEvalShift,
  } from './move-validation';
  ```
  Then **replace the whole body of `preValidateMove`** (currently `:2639-2983`, from `async preValidateMove(` through its closing brace) with the two methods below:
  ```ts
  /**
   * Story 13-1 (KON-131) — loads every input the move decision reads, from `client`.
   * Pass `this.prisma` for the advisory path or the active `tx` for the write path, so the
   * enforcement replay sees the same rows the write is about to commit against.
   *
   * The statutory window is +/- 8 REAL days around the target date — the same window
   * `createManualShift` uses, and the one `wouldExceedStatutory` documents as its minimum
   * (candidate's ISO week +/- 1 day). The rotation pool stays month-based (quarter loaded
   * lazily, only when a quarterly rule exists) to preserve the historic counting semantics.
   */
  private async loadMoveValidationInputs(
    clinicId: string,
    args: {
      shift: MoveEvalShift;
      targetEmployeeId: string;
      targetDate: string;
    },
    client: Prisma.TransactionClient,
  ): Promise<MoveEvalContext> {
    const { shift, targetEmployeeId, targetDate } = args;
    const targetDateObj = new Date(`${targetDate}T00:00:00.000Z`);
    const [year, monthNum] = targetDate.substring(0, 7).split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));
    const weekBounds = this.getWeekBounds(targetDate);

    const statWindowStart = new Date(targetDateObj);
    statWindowStart.setUTCDate(statWindowStart.getUTCDate() - 8);
    const statWindowEnd = new Date(targetDateObj);
    statWindowEnd.setUTCDate(statWindowEnd.getUTCDate() + 8);

    const rules = await this.planningService.listRules(clinicId, {
      isActive: true,
    });
    const needsQuarter = rules.some(
      (r) =>
        r.category === 'ROTATION_EQUITY' &&
        (r.config as Record<string, unknown>).trackingPeriod === 'quarterly',
    );
    const quarter = Math.floor((monthNum - 1) / 3);
    const quarterStart = new Date(Date.UTC(year, quarter * 3, 1));
    const quarterEnd = new Date(
      Date.UTC(year, quarter * 3 + 3, 0, 23, 59, 59, 999),
    );

    const employeeShiftWhere = {
      employeeId: targetEmployeeId,
      clinicId,
      id: { not: shift.id },
    };

    const [
      employee,
      operationalConfig,
      unavailabilities,
      sameDayShifts,
      weekShifts,
      monthShifts,
      statutoryWindowShifts,
      quarterExtraShifts,
    ] = await Promise.all([
      client.employee.findFirst({
        where: { id: targetEmployeeId, clinicId, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobType: true,
          contractHours: true,
        },
      }),
      this.clinicService.getOperationalConfig(clinicId),
      client.unavailability.findMany({
        where: {
          employeeId: targetEmployeeId,
          clinicId,
          startDate: { lte: new Date(`${targetDate}T23:59:59.999Z`) },
          endDate: { gte: new Date(`${targetDate}T00:00:00.000Z`) },
        },
      }),
      client.shift.findMany({ where: { ...employeeShiftWhere, date: targetDateObj } }),
      client.shift.findMany({
        where: {
          ...employeeShiftWhere,
          date: {
            gte: new Date(`${weekBounds.start}T00:00:00.000Z`),
            lte: new Date(`${weekBounds.end}T23:59:59.999Z`),
          },
        },
      }),
      client.shift.findMany({
        where: { ...employeeShiftWhere, date: { gte: monthStart, lte: monthEnd } },
      }),
      client.shift.findMany({
        where: {
          ...employeeShiftWhere,
          date: { gte: statWindowStart, lte: statWindowEnd },
        },
      }),
      needsQuarter
        ? client.shift.findMany({
            where: {
              ...employeeShiftWhere,
              date: { gte: quarterStart, lte: quarterEnd },
              NOT: { date: { gte: monthStart, lte: monthEnd } },
            },
          })
        : Promise.resolve([]),
    ]);

    const toEval = (s: {
      id: string;
      employeeId: string;
      date: Date;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      shiftTypeCode: string;
    }): MoveEvalShift => ({
      id: s.id,
      employeeId: s.employeeId,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: s.breakMinutes ?? 0,
      shiftTypeCode: s.shiftTypeCode,
    });

    return {
      shift,
      target: { employeeId: targetEmployeeId, date: targetDate },
      employee,
      operationalConfig: {
        workDays: operationalConfig.workDays,
        closedDays: operationalConfig.closedDays,
      },
      unavailabilities: unavailabilities.map((ua) => ({
        type: ua.type,
        reason: ua.reason,
        daysOfWeek: ua.daysOfWeek,
      })),
      sameDayShifts: sameDayShifts.map(toEval),
      weekShifts: weekShifts.map(toEval),
      monthShifts: monthShifts.map(toEval),
      quarterExtraShifts: quarterExtraShifts.map(toEval),
      statutoryWindowShifts: statutoryWindowShifts.map(toEval),
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        ruleType: r.ruleType as RuleType,
        category: r.category,
        config: r.config as Record<string, unknown>,
      })),
    };
  }

  /**
   * Advisory dry-run for drop feedback in the grid. Story 13-1 (KON-131): this is now UX
   * ONLY — `moveShift` replays the same evaluator inside its write transaction, so a client
   * that skips this call (or ignores its result) cannot persist an illegal move (audit T1).
   */
  async preValidateMove(
    clinicId: string,
    input: { shiftId: string; targetEmployeeId: string; targetDate: string },
  ): Promise<MoveValidationResult> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: input.shiftId },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.clinicId !== clinicId)
      throw new ForbiddenException('Shift does not belong to this clinic');

    const inputs = await this.loadMoveValidationInputs(
      clinicId,
      {
        shift: {
          id: shift.id,
          employeeId: shift.employeeId,
          date: shift.date.toISOString().split('T')[0],
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakMinutes: shift.breakMinutes ?? 0,
          shiftTypeCode: shift.shiftTypeCode,
        },
        targetEmployeeId: input.targetEmployeeId,
        targetDate: input.targetDate,
      },
      this.prisma,
    );
    return evaluateMoveViolations(inputs);
  }
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service -t preValidateMove`
  Expected: `Tests:` all `preValidateMove` tests passed with **no edit to the spec file** — this is the refactor's safety net, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "refactor(KON-131): rewire preValidateMove onto the shared evaluator (statutory window to +/-8d)"`

- [ ] **Task 4: Rewrite `moveShift` — lock, reload, evaluate, write, all in one transaction** [AC: 1, 2, 3, 5]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, add this private helper immediately after `withSerializationRetry` (`:170-188`):
  ```ts
  /**
   * Story 13-1 (KON-131) — takes the (clinicId, month) advisory lock for every month a write
   * touches, in SORTED order. Sorting is load-bearing: a cross-month move locks two months,
   * and two admins moving in opposite directions (2026-03 -> 2026-04 and 2026-04 -> 2026-03)
   * would deadlock if each locked "source then target". Same key shape as generation (:747)
   * and publish (:3048), so manual writes now serialize against both. Auto-released at
   * COMMIT / ROLLBACK on the transaction's pinned connection.
   */
  private async lockMonths(
    tx: Prisma.TransactionClient,
    clinicId: string,
    months: string[],
  ): Promise<void> {
    for (const m of [...new Set(months)].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clinicId}), hashtext(${m}))`;
    }
  }
  ```
  Then **replace the region of `moveShift` from the `// Check for time overlap on the target employee + date` comment (`:2364`) through the end of the `const updated = await this.prisma.$transaction(...)` statement (`:2424`)** with:
  ```ts
    const employeeChanged =
      !!target.targetEmployeeId && target.targetEmployeeId !== shift.employeeId;
    const dateChanged =
      !!target.targetDate && target.targetDate !== originalDateISO;

    // Story 11-6 — the shift mutation and the amendment bookkeeping commit atomically.
    // Story 13-1 (KON-131) — and so does the DECISION: the lock is the transaction's first
    // statement, every validation read is replayed from `tx` under it, and the write only
    // happens if that replay is clean. Before this story the overlap check ran outside the
    // transaction against an unlocked snapshot (audit T2) and no statutory / rule-engine
    // check ran on this path at all (audit T1) — `preValidateMove` was the only guard, and
    // it is client-invoked. Notification still fires AFTER commit (below), so a rejected or
    // rolled-back change can never notify (AC2).
    const amend =
      publishedMonths.length > 0 && (employeeChanged || dateChanged);
    const updated = await this.withSerializationRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.lockMonths(tx, clinicId, [originalMonth, targetMonth]);

          // Re-read under the lock — the shift may have been moved or deleted meanwhile.
          const fresh = await tx.shift.findUnique({ where: { id: shiftId } });
          if (!fresh) throw new NotFoundException('Shift not found');
          if (fresh.clinicId !== clinicId)
            throw new ForbiddenException('Shift does not belong to this clinic');

          const inputs = await this.loadMoveValidationInputs(
            clinicId,
            {
              shift: {
                id: fresh.id,
                employeeId: fresh.employeeId,
                date: fresh.date.toISOString().split('T')[0],
                startTime: fresh.startTime,
                endTime: fresh.endTime,
                breakMinutes: fresh.breakMinutes ?? 0,
                shiftTypeCode: fresh.shiftTypeCode,
              },
              targetEmployeeId: target.targetEmployeeId ?? fresh.employeeId,
              targetDate:
                target.targetDate ?? fresh.date.toISOString().split('T')[0],
            },
            tx,
          );
          const { hard } = evaluateMoveViolations(inputs);
          if (hard.length > 0) {
            throw new ConflictException(
              `Move rejected — ${hard.length} blocking violation(s): ${hard
                .map((h) => h.message)
                .join('; ')}`,
            );
          }

          const u = await tx.shift.update({
            where: { id: shiftId },
            data: {
              ...(target.targetEmployeeId && {
                employeeId: target.targetEmployeeId,
              }),
              ...(target.targetDate && {
                date: new Date(`${target.targetDate}T00:00:00.000Z`),
              }),
              source: 'MANUAL',
              // Story 7.6 — a moved shift is no longer the one the employee confirmed
              ...((employeeChanged || dateChanged) && { isConfirmed: false }),
            },
          });
          if (amend) {
            await this.recordAmendment(tx, clinicId, publishedMonths);
          }
          return u;
        },
        { timeout: 15000 },
      ),
    );
  ```
  Then, in `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add the operational-config override to the **existing `describe('moveShift')` `beforeEach`** (`:5099-5108`) — insert as its first line. Without it every `moveShift` test now fails on `NON_WORK_DAY`: the global `mockOperationalConfig.workDays` is `['1','2','3','4','5']`, which the evaluator's `DAY_NAME_TO_ISO` maps to nothing, leaving `workDaySet` empty. `preValidateMove`'s describe already carries the same override (`:6423-6426`).
  ```ts
      mockClinicService.getOperationalConfig.mockResolvedValue({
        ...mockOperationalConfig,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      });
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service -t moveShift`
  Expected: `Tests:` all passed. The existing `throws ConflictException when shift overlaps with existing` test still passes — it asserts on the substring `'overlaps'`, which the composed message preserves.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "fix(KON-131): enforce statutory + HARD rules in moveShift under the shared lock (audit T1/T2)"`

- [ ] **Task 5: Lock `createManualShift` and move its checks inside the transaction** [AC: 3]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, **replace the region of `createManualShift` from the `// Check for time overlap on the target employee + date` comment (`:2492`) through the end of the `const created = await this.prisma.$transaction(...)` statement (`:2568`)** with:
  ```ts
    // Story 13-1 (KON-131) — same shape as moveShift: lock first, then replay every check
    // from `tx` under it. The overlap check and the 11-3 statutory check used to run against
    // an unlocked pre-transaction snapshot, so a concurrent generation could commit a
    // conflicting shift between the check and the create (audit T2).
    const created = await this.withSerializationRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.lockMonths(tx, clinicId, [month]);

          const existingShifts = await tx.shift.findMany({
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

          // Story 11-3 — statutory French labor-law HARD check on the +/-8 real-day window.
          // Enforced regardless of configured rules.
          const statWindowStart = new Date(`${input.date}T00:00:00.000Z`);
          statWindowStart.setUTCDate(statWindowStart.getUTCDate() - 8);
          const statWindowEnd = new Date(`${input.date}T00:00:00.000Z`);
          statWindowEnd.setUTCDate(statWindowEnd.getUTCDate() + 8);
          const statWindowShifts = await tx.shift.findMany({
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

          // Story 11-6 — create + amendment commit atomically; notify post-commit.
          const c = await tx.shift.create({
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
          if (publishedMonths.length > 0) {
            await this.recordAmendment(tx, clinicId, publishedMonths);
          }
          return c;
        },
        { timeout: 15000 },
      ),
    );
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service -t createManualShift`
  Expected: `Tests:` all passed, exit 0. The default spec `$transaction` mock (`:283-286`) runs the callback with the base mock as `tx`, so `tx.shift.findMany` resolves from the same mocks the tests already set.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "fix(KON-131): serialize createManualShift on the shared advisory lock"`

- [ ] **Task 6: Re-validate the computed plan inside the generation transaction** [AC: 4]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, inside `generateMonthlyPlan`'s transaction, insert the block below **between the advisory lock (`:747`) and the `tx.shift.deleteMany` call (`:753`)**:
  ```ts
            // Story 13-1 (KON-131) — audit T2 (TOCTOU). `assignedShifts` was computed far
            // above, OUTSIDE this transaction and BEFORE the lock: survivors and manual
            // shifts were read from a snapshot a concurrent moveShift / createManualShift may
            // have invalidated since. Now that the lock is held, re-read the shifts that will
            // SURVIVE the deleteMany below (exact complement of its filter) and re-check the
            // plan against them. The 11-2 @@unique constraint only catches an exact
            // (employee, date, slot) duplicate — a partial time overlap between two different
            // slots slips past it, which is precisely the double-booking this closes.
            const survivors = await tx.shift.findMany({
              where: {
                clinicId,
                date: { gte: monthStart, lte: monthEnd },
                NOT: {
                  source: 'GENERATED',
                  isConfirmed: false,
                  varianceEvents: { none: {} },
                },
              },
              select: {
                employeeId: true,
                date: true,
                startTime: true,
                endTime: true,
              },
            });
            const survivorsByKey = new Map<string, typeof survivors>();
            for (const s of survivors) {
              const key = `${s.employeeId}|${s.date.toISOString().split('T')[0]}`;
              const arr = survivorsByKey.get(key) ?? [];
              arr.push(s);
              survivorsByKey.set(key, arr);
            }
            const staleConflicts = assignedShifts.filter((a) =>
              (survivorsByKey.get(`${a.employeeId}|${a.date}`) ?? []).some((s) =>
                this.timesOverlap(a.startTime, a.endTime, s.startTime, s.endTime),
              ),
            );
            if (staleConflicts.length > 0) {
              this.logger.warn(
                `KON-131 stale plan for ${clinicId}/${month}: ${staleConflicts.length} assignment(s) conflict with shifts committed since the plan was computed — rejecting, the client can regenerate`,
              );
              throw new ConflictException('STALE_PLAN_REGENERATE');
            }
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service -t generateMonthlyPlan`
  Expected: `Tests:` all passed, exit 0. Tests that override `$transaction` with a bespoke `tx` (`:1433`, `:1486`, `:1527`, `:1682`, `:1779`, `:1837`, `:1902`) need `tx.shift.findMany` to resolve — where a bespoke `tx` lacks it, add `findMany: jest.fn().mockResolvedValue([])` to that tx's `shift` mock.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts && git commit -m "fix(KON-131): re-validate the generated plan against DB state inside the write transaction (audit T2)"`

- [ ] **Task 7: Regression — a direct-API illegal move is rejected** [AC: 1, 5]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, append the block below at the end of the top-level `describe('PlanningGenerationService')` (immediately before its closing `});`).
  ```ts
    // ─── Story 13-1 (KON-131) — server-side manual-write guards ──────
    // Audit 2026-07-14 T1: moveShift persisted with zero statutory / rule-engine guard;
    // preValidateMove (client-invoked) was the only check. These tests call the service
    // directly — exactly what a client hitting the tRPC API without pre-validating does.
    describe('Story 13-1 — moveShift server-side guards', () => {
      const movedShift = {
        id: 'shift-1',
        clinicId: 'clinic-123',
        employeeId: 'emp-1',
        date: new Date('2026-03-02T00:00:00.000Z'), // Monday
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 0,
        source: 'GENERATED',
        isConfirmed: false,
      };

      beforeEach(() => {
        mockClinicService.getOperationalConfig.mockResolvedValue({
          ...mockOperationalConfig,
          workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        });
        mockPrismaService.shift.findUnique.mockResolvedValue(movedShift);
        mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
        mockPrismaService.shift.findMany.mockResolvedValue([]);
        mockPrismaService.shift.update.mockResolvedValue({
          ...movedShift,
          employeeId: 'emp-2',
          source: 'MANUAL',
        });
      });

      // AC1 (verbatim from story 13-1): Given a move that would introduce a statutory or
      //   HARD-rule violation, When planning.moveShift is called from any client, Then the
      //   mutation is rejected server-side and no shift.update is persisted.
      it('rejects a move that breaches a statutory limit, with no client pre-check involved', async () => {
        // emp-2 already holds 13:00-20:00 (7h) on 2026-03-02; the moved 08:00-12:00 (4h)
        // takes the day to 11h > the 10h L.3121-18 limit. Amplitude 08:00->20:00 = 12h stays
        // under 13h, so DAILY_WORK is the only statutory breach, and 13:00 does not overlap
        // 08:00-12:00 so OVERLAP stays silent.
        mockPrismaService.shift.findMany.mockResolvedValue([
          {
            id: 'shift-2',
            employeeId: 'emp-2',
            clinicId: 'clinic-123',
            date: new Date('2026-03-02T00:00:00.000Z'),
            startTime: '13:00',
            endTime: '20:00',
            breakMinutes: 0,
            shiftTypeCode: 'RECEPTION',
          },
        ]);
        await expect(
          service.moveShift('clinic-123', 'shift-1', {
            targetEmployeeId: 'emp-2',
          }),
        ).rejects.toThrow('Statutory limit exceeded: DAILY_WORK');
        expect(mockPrismaService.shift.update).not.toHaveBeenCalled();
      });

      it('rejects a move onto a non-work day', async () => {
        await expect(
          service.moveShift('clinic-123', 'shift-1', {
            targetDate: '2026-03-07', // Saturday
          }),
        ).rejects.toThrow('Target date is not a work day');
        expect(mockPrismaService.shift.update).not.toHaveBeenCalled();
      });

      it('rejects a move onto a HARD-unavailable employee', async () => {
        mockPrismaService.unavailability.findMany.mockResolvedValue([
          { type: 'VACATION', reason: null, daysOfWeek: [] },
        ]);
        await expect(
          service.moveShift('clinic-123', 'shift-1', {
            targetEmployeeId: 'emp-2',
          }),
        ).rejects.toThrow('Employee is unavailable (VACATION)');
        expect(mockPrismaService.shift.update).not.toHaveBeenCalled();
      });

      it('persists a legal move', async () => {
        const result = await service.moveShift('clinic-123', 'shift-1', {
          targetEmployeeId: 'emp-2',
        });
        expect(result.employeeId).toBe('emp-2');
        expect(mockPrismaService.shift.update).toHaveBeenCalled();
      });
    });
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service -t "Story 13-1 — moveShift server-side guards"`
  Expected: `Tests: 4 passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-131): direct-API illegal moves are rejected server-side (AC1, AC5)"`

- [ ] **Task 8: Regression — a published month is never notified before the guard runs** [AC: 2]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, append the block below **inside** the `describe('Story 13-1 — moveShift server-side guards')` added in Task 7, after its last `it(...)`.
  ```ts
      // AC2 (verbatim from story 13-1): Given a PUBLISHED month, When an acknowledged
      //   amendment would violate a statutory limit, Then it is rejected before any employee
      //   notification is sent and before any amendment is recorded.
      it('rejects a statutory-breaching amendment on a PUBLISHED month before notifying', async () => {
        mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
          { month: '2026-03' },
        ]);
        mockPrismaService.shift.findMany.mockResolvedValue([
          {
            id: 'shift-2',
            employeeId: 'emp-2',
            clinicId: 'clinic-123',
            date: new Date('2026-03-02T00:00:00.000Z'),
            startTime: '13:00',
            endTime: '20:00',
            breakMinutes: 0,
            shiftTypeCode: 'RECEPTION',
          },
        ]);
        await expect(
          service.moveShift(
            'clinic-123',
            'shift-1',
            { targetEmployeeId: 'emp-2' },
            { acknowledgePublishedChange: true },
          ),
        ).rejects.toThrow('Statutory limit exceeded: DAILY_WORK');
        expect(mockPrismaService.shift.update).not.toHaveBeenCalled();
        expect(mockMailService.sendScheduleChangedEmail).not.toHaveBeenCalled();
        expect(
          mockPrismaService.planningPeriodStatus.updateMany,
        ).not.toHaveBeenCalled();
      });
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service -t "rejects a statutory-breaching amendment"`
  Expected: `Tests: 1 passed`, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-131): published-month amendment rejected before notification (AC2)"`

- [ ] **Task 9: Regression — the lock is taken, and a stale plan is rejected** [AC: 3, 4, 5]
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, append the block below at the end of the top-level `describe('PlanningGenerationService')`, after the Task 7 describe.
  ```ts
    // ─── Story 13-1 (KON-131) — shared lock + TOCTOU ─────────────────
    // Audit 2026-07-14 T2: manual writes took no advisory lock, and the generated plan was
    // persisted without being re-checked against the state committed since it was computed.
    describe('Story 13-1 — shared advisory lock and stale-plan rejection', () => {
      const lockSql = (calls: unknown[][]) =>
        calls.filter((c) => String(c[0]).includes('pg_advisory_xact_lock'));

      beforeEach(() => {
        mockClinicService.getOperationalConfig.mockResolvedValue({
          ...mockOperationalConfig,
          workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        });
        mockPrismaService.shift.findMany.mockResolvedValue([]);
      });

      // AC3 (verbatim from story 13-1): moveShift, createManualShift and generateMonthlyPlan
      //   all serialize on the same pg_advisory_xact_lock(clinicId, month).
      it('moveShift takes the (clinicId, month) advisory lock', async () => {
        mockPrismaService.shift.findUnique.mockResolvedValue({
          id: 'shift-1',
          clinicId: 'clinic-123',
          employeeId: 'emp-1',
          date: new Date('2026-03-02T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
          source: 'GENERATED',
          isConfirmed: false,
        });
        mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
        mockPrismaService.shift.update.mockResolvedValue({
          id: 'shift-1',
          clinicId: 'clinic-123',
          employeeId: 'emp-2',
          date: new Date('2026-03-02T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
          source: 'MANUAL',
          isConfirmed: false,
        });
        mockPrismaService.$executeRaw.mockResolvedValue(0);

        await service.moveShift('clinic-123', 'shift-1', {
          targetEmployeeId: 'emp-2',
        });
        expect(
          lockSql(mockPrismaService.$executeRaw.mock.calls).length,
        ).toBeGreaterThanOrEqual(1);
      });

      // A cross-month move locks BOTH months, in sorted order — two admins moving in
      // opposite directions must not deadlock.
      it('a cross-month move locks both months in sorted order', async () => {
        mockPrismaService.shift.findUnique.mockResolvedValue({
          id: 'shift-1',
          clinicId: 'clinic-123',
          employeeId: 'emp-1',
          date: new Date('2026-04-01T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
          source: 'GENERATED',
          isConfirmed: false,
        });
        mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
        mockPrismaService.shift.update.mockResolvedValue({
          id: 'shift-1',
          clinicId: 'clinic-123',
          employeeId: 'emp-1',
          date: new Date('2026-03-02T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
          source: 'MANUAL',
          isConfirmed: false,
        });
        mockPrismaService.$executeRaw.mockResolvedValue(0);

        await service.moveShift('clinic-123', 'shift-1', {
          targetDate: '2026-03-02',
        });
        const months = lockSql(mockPrismaService.$executeRaw.mock.calls).flatMap(
          (c) => (c as unknown[]).slice(1).map(String),
        );
        const monthArgs = months.filter((m) => /^\d{4}-\d{2}$/.test(m));
        expect(monthArgs).toEqual([...monthArgs].sort());
        expect(new Set(monthArgs)).toEqual(new Set(['2026-03', '2026-04']));
      });
    });
  ```
  The stale-plan arm (AC4) belongs with the generation fixtures rather than here — add this `it` **inside the existing `describe('Story 11-2 — surviving shifts visible to generator')`**, whose bespoke `tx` already exercises the survivor path:
  ```ts
      // AC4 (verbatim from story 13-1): Given a plan computed on a snapshot a concurrent
      //   manual write has since invalidated, When generateMonthlyPlan reaches its write
      //   transaction, Then it rejects with STALE_PLAN_REGENERATE rather than persisting a
      //   double-booking. This is the audit T2 race: the survivor read that fed the plan
      //   happened before the lock; the re-read under the lock sees the racing shift.
      it('Story 13-1 — rejects a plan whose assignment now overlaps a shift committed since it was computed', async () => {
        const racingShift = {
          employeeId: 'emp-1',
          date: new Date('2026-03-02T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '18:00',
        };
        const tx = {
          $executeRaw: jest.fn().mockResolvedValue(0),
          shift: {
            // The plan was computed against an empty month; by the time the lock is held a
            // concurrent createManualShift has committed an overlapping MANUAL shift.
            findMany: jest.fn().mockResolvedValue([racingShift]),
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createManyAndReturn: jest.fn().mockResolvedValue([]),
          },
        };
        mockPrismaService.$transaction.mockImplementation(
          async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
        );

        await expect(
          service.generateMonthlyPlan('clinic-123', '2026-03', 'template-1'),
        ).rejects.toThrow('STALE_PLAN_REGENERATE');
        expect(tx.shift.createManyAndReturn).not.toHaveBeenCalled();
      });
  ```
  Run: `pnpm --filter @pawly/api test -- planning-generation.service -t "Story 13-1"`
  Expected: `Tests: 3 passed`, exit 0. If the stale-plan `it` reports zero conflicts, the fixture's generated assignment is not landing on `emp-1` / `2026-03-02` — align `racingShift` with an employee/date the fixture's plan actually assigns (read the `createManyAndReturn` rows the sibling test captures at `:1902`) rather than weakening the assertion.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-131): shared lock + stale-plan rejection (AC3, AC4, AC5)"`

- [ ] **Task 10: Full API suite, typecheck, and story close-out** [AC: 1, 2, 3, 4, 5]
  Run the full API suite and the typecheck. Both must be clean before the story is handed to review.
  ```bash
  pnpm --filter @pawly/api test -- planning
  pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json
  pnpm --filter @pawly/api exec tsc -p tsconfig.types.json
  ```
  Expected: `Tests:` all passed with `0 failed` across `planning-generation.service.spec.ts`, `move-validation.spec.ts`, `planning.service.spec.ts`, `french-labor-law.spec.ts`, `rule-engine.spec.ts`; both `tsc` runs exit 0 with no output.
  Commit: `git add -A && git commit -m "chore(KON-131): full planning suite + typecheck green"`

## Dev Notes

### Architecture & data flow

The move path has two entry points and, before this story, two independent implementations:

```
grid drag ──► useDragAndDrop.ts:52 ──► preValidateMove ──┐ (advisory, UX)
                                                          ├─► two separate rule implementations
any client ──► tRPC planning.moveShift:327 ──► moveShift ─┘ (the write — had NO rules at all)
```

After this story there is one evaluator and two callers:

```
preValidateMove ─► loadMoveValidationInputs(this.prisma) ─┐
                                                           ├─► evaluateMoveViolations (pure)
moveShift ───────► loadMoveValidationInputs(tx) ──────────┘   └─► hard.length > 0 ? throw : write
                   ▲ inside $transaction, after lockMonths
```

The tRPC → service contract is unchanged (`planning.router.ts:327-345`), so no `@pawly/validators` schema moves and no web change is needed.

### Non-goals (explicit — keep the 13-2 / 13-3 boundaries clean)

- **Do NOT** widen the publish path's window (`validateShiftsAgainstRules` → `planning.service.ts:178-182`) or the generation/replay eligibility window. **Do NOT** touch `clampGapLen` (`french-labor-law.ts:200-204`). All of that is **13-2**, which depends on this story.
- **Do NOT** make `timesOverlap` wrap-aware. Cross-midnight overlap is audit T3 and belongs to **13-3**, whose regression baseline is "same-date behaviour unchanged".
- **Do NOT** add new statutory limits (11h daily rest, 48h weekly ceiling, 20-min break). That is **13-4**.
- **Do NOT** recompute `hardViolations` / `softViolations` for the served plan. That is **13-6**.

### The one non-obvious decision: why the lock must be the transaction's first statement

`pg_advisory_xact_lock` auto-releases at COMMIT/ROLLBACK on the transaction's pinned connection — which is why 11-5 chose it over a session-level lock (safe with the Prisma pool). But it only serializes what happens *after* it. Today `moveShift` reads its overlap check at `:2370`, then opens a transaction at `:2405`: a concurrent generation can commit between the two, and the move writes anyway. Moving the reads inside the transaction is therefore not a tidiness change — it is the entire fix. Same reasoning for `generateMonthlyPlan`: the lock at `:747` is real, but `assignedShifts` was computed long before it, so the lock currently protects only the delete+create pair, not the decision that produced it.

Both transactions run at the default READ COMMITTED, so the waiter's post-lock reads take a fresh per-statement snapshot and see the winner's committed rows — exactly the property 11-5's comment (`:158-167`) documents. `withSerializationRetry` is reused so a `P2034` deadlock against an unrelated writer replays the whole transaction.

### File decisions (one responsibility each)

- **`apps/api/src/modules/planning/move-validation.ts`** (new) — *Decide whether a move violates HARD/SOFT rules, from data already in memory.* In: `MoveEvalContext` (shift, resolved target, employee, config, unavailabilities, shift pools, rules). Out: `MoveValidationResult` from `@pawly/validators`. Imports `french-labor-law` + `rule-engine`; imports nothing from NestJS or Prisma.
- **`apps/api/src/modules/planning/move-validation.spec.ts`** (new) — *Prove the evaluator's decisions on hand-built contexts.* In: literal `MoveEvalContext` objects. Out: Jest assertions. No Prisma mocks.
- **`apps/api/src/modules/planning/planning-generation.service.ts`** (modified) — *Load the evaluator's inputs, hold the lock, apply the write.* Gains `lockMonths` + `loadMoveValidationInputs`; `preValidateMove` and `moveShift` shrink to load → evaluate → (return | throw + write); `createManualShift` and `generateMonthlyPlan` gain the lock and the in-transaction replay.
- **`apps/api/src/modules/planning/planning-generation.service.spec.ts`** (modified) — *Prove the wiring: the guard runs on the write path, under the lock, before notification.*

### Existing code at write time (Step-0 verbatim quotes — re-locate the symbol, numbers may drift)

`planning-generation.service.ts:2364-2392` (current) — the overlap check `moveShift` runs **outside** any transaction and with no lock. It is the *only* rule check on the write path:

```ts
    // Check for time overlap on the target employee + date
    const overlapEmployeeId = target.targetEmployeeId || shift.employeeId;
    const overlapDate = target.targetDate
      ? new Date(`${target.targetDate}T00:00:00.000Z`)
      : shift.date;

    const existingShifts = await this.prisma.shift.findMany({
      where: {
        employeeId: overlapEmployeeId,
        clinicId,
        date: overlapDate,
        id: { not: shiftId },
      },
    });

    for (const existing of existingShifts) {
      if (
        this.timesOverlap(
          shift.startTime,
          shift.endTime,
          existing.startTime,
          existing.endTime,
        )
      ) {
        throw new ConflictException(
          `Shift overlaps with existing shift (${existing.startTime}-${existing.endTime})`,
        );
      }
    }
```

`planning-generation.service.ts:2403-2424` (current) — the transaction `moveShift` opens: no advisory lock, no re-read, no re-validation. Task 4 replaces this:

```ts
    const amend =
      publishedMonths.length > 0 && (employeeChanged || dateChanged);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.shift.update({
        where: { id: shiftId },
        data: {
          ...(target.targetEmployeeId && {
            employeeId: target.targetEmployeeId,
          }),
          ...(target.targetDate && {
            date: new Date(`${target.targetDate}T00:00:00.000Z`),
          }),
          source: 'MANUAL',
          // Story 7.6 — a moved shift is no longer the one the employee confirmed
          ...((employeeChanged || dateChanged) && { isConfirmed: false }),
        },
      });
      if (amend) {
        await this.recordAmendment(tx, clinicId, publishedMonths);
      }
      return u;
    });
```

`planning-generation.service.ts:2958-2982` (current) — the statutory check as it exists **only** on the advisory path, windowed on `monthShifts` (the strict month — audit T4). Task 3 moves this into the pure evaluator and widens the window to ±8 real days:

```ts
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
      hard.push({
        rule: 'CONTRACT_COMPLIANCE',
        message: `Statutory limit exceeded: ${kind}`,
      });
    }

    return { hard, soft };
  }
```

`planning-generation.service.ts:2519-2529` (current) — the ±8-real-day window `createManualShift` already uses. This is the reference the evaluator adopts:

```ts
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
```

`planning-generation.service.ts:747-761` (current) — the generation lock and the delete it protects. Task 6 inserts the re-validation between them:

```ts
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clinicId}), hashtext(${month}))`;

            // Story 11-1 — preserve confirmed shifts and shifts carrying variance
            // history (VarianceEvent cascades on delete → would erase no-show /
            // clock-in records). Only unconfirmed, history-free GENERATED shifts
            // are cleared before regeneration.
            await tx.shift.deleteMany({
              where: {
                clinicId,
                source: 'GENERATED',
                isConfirmed: false,
                varianceEvents: { none: {} },
                date: { gte: monthStart, lte: monthEnd },
              },
            });
```

`rule-engine.ts:75-99` (current) — the helpers the evaluator reuses instead of re-deriving:

```ts
/** Net worked minutes: (end - start) with overnight wrap, minus break. */
export function netMinutes(
  startTime: string,
  endTime: string,
  breakMinutes = 0,
): number {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const gross = end >= start ? end - start : MIN_PER_DAY - start + end;
  return gross - breakMinutes;
}

/** ISO-week Monday (UTC) as 'YYYY-MM-DD' — matches PlanningGenerationService.getWeekBounds. */
export function isoWeekStart(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00.000Z`);
  const dow = date.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().split('T')[0];
}

/** ISO weekday 1..7 (Mon..Sun) for a 'YYYY-MM-DD' date, UTC. */
export function isoWeekday(dateISO: string): number {
  const dow = new Date(`${dateISO}T00:00:00.000Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}
```

`packages/validators/src/planning/shift-mutation.schema.ts:63-77` (current) — the result contract the evaluator must keep returning. **Unchanged by this story:**

```ts
export const moveValidationResultSchema = z.object({
  hard: z.array(
    z.object({
      rule: z.string(),
      message: z.string(),
    })
  ),
  soft: z.array(
    z.object({
      rule: z.string(),
      message: z.string(),
    })
  ),
});
export type MoveValidationResult = z.infer<typeof moveValidationResultSchema>;
```

`apps/web/src/app/[locale]/admin/planning/_hooks/useShiftMutations.ts:34-56` (current) — why no web change is needed: the rollback and the error toast already exist. A `ConflictException` raised by the new guard lands in `onError`, restores the snapshot, and surfaces the message as a toast description.

```ts
  const { mutate: moveShift, isPending: isMoving } = useServerActionMutation(moveShiftAction, {
    onMutate: async () => {
      // Cancel in-flight queries for this month to avoid overwriting rollback snapshot
      await queryClient.cancelQueries({ queryKey: QueryKeyFactory.planningScheduleView(month) });
      // Snapshot previous data for rollback
      const previous = queryClient.getQueryData(QueryKeyFactory.planningScheduleView(month));
      return { previous };
    },
    onSuccess: () => {
      toast.success(t('moveSuccess'));
    },
    onError: (_err: { message?: string }, _vars: unknown, context: unknown) => {
      // Rollback on error
      const ctx = context as { previous?: unknown } | undefined;
      if (ctx?.previous) {
        queryClient.setQueryData(QueryKeyFactory.planningScheduleView(month), ctx.previous);
      }
      if (_err?.message === 'PUBLISHED_CHANGE_REQUIRES_ACK') {
        toast.error(t('publishedChangeRequired'));
      } else {
        toast.error(t('moveError'), { description: _err?.message });
      }
    },
```

### Testing

- **API**: Jest, `*.spec.ts`, run `pnpm --filter @pawly/api test -- <pattern>`. New: `move-validation.spec.ts`. Extended: `planning-generation.service.spec.ts`. Never run bare `pnpm test` at the root — the rtk shim breaks the root runner (epic-11 memo); always `--filter`.
- **The mock landmine (this will cost you three RED cycles if you skip it):** the global `mockOperationalConfig.workDays` is `['1','2','3','4','5']` (`planning-generation.service.spec.ts:98-99`), but production stores day NAMES — `ClinicConfig.workDays` is `String[]` and `updateWorkDaysSchema` rejects `'monday'` / `'NOTADAY'`, while the generation path documents `["MONDAY", "TUESDAY", ...]` at `:1991`. The mock is simply wrong. `preValidateMove`'s describe already works around it locally (`:6421-6426`) — which is why nobody noticed. The moment `moveShift` starts *enforcing* the evaluator, that stale mock makes `workDaySet` empty and every `moveShift` test dies on `NON_WORK_DAY`. Task 4 adds the same override to the `moveShift` describe. Do not "fix" the global mock instead: several generation tests read `workDays` through a different code path and are green against the numeric form — changing it globally is a separate, unscoped diff.
- **The other shared-mock trap (epic-11 memo):** `shift.findMany` is shared across `loadBorderWeekShifts` / `loadSurvivingShiftsInMonth` in the generation specs — key any new mock on the `where` predicate shape (survivors `OR` vs border `date.in`), see `:1633` / `:1896` / `:6110`. `loadMoveValidationInputs` adds four more `shift.findMany` calls on the move path; in the move describes a single `mockResolvedValue([...])` satisfies all four, which the Task 7 fixture relies on deliberately.
- **Typecheck**: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json`, plus the load-bearing `tsc -p tsconfig.types.json` pass (lesson L5 — never skip it as "redundant"). Rebuild `@pawly/*` dist before the app tsc if a cross-package type looks stale (epic-11 memo).

### Dependencies

- No new npm packages. No Prisma schema change, no migration, no `db:push`. No Trigger.dev task change → **no redeploy**.
- Consult Context7 for any Prisma interactive-transaction nuance touched in Tasks 4-6 — in particular `Promise.all` on a `TransactionClient` and `$executeRaw` parameter binding inside `$transaction` (lesson L4).
- Depends on: none (Wave 1). Blocks: 13-2 (KON-134), which will re-window the remaining validation paths onto the same evaluator.

### Commit prefix

`feat(KON-131): ...` (see per-task commit lines; `fix(...)` / `test(...)` / `refactor(...)` / `chore(...)` where the task says so).

## File List

_Files this story creates or modifies (final list confirmed by aped-dev at completion):_

- `apps/api/src/modules/planning/move-validation.ts` (new)
- `apps/api/src/modules/planning/move-validation.spec.ts` (new)
- `apps/api/src/modules/planning/planning-generation.service.ts`
- `apps/api/src/modules/planning/planning-generation.service.spec.ts`

## Dev Agent Record

### Summary

### Files changed

### Deviations

### Test output
