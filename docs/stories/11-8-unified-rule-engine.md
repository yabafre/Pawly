# Story: 11-8-unified-rule-engine — Unify the Rule Engine (single HARD/SOFT evaluator)

**Epic:** Epic 11 — Planning Engine Hardening & Compliance
**Status:** review
**Branch:** feature/KON-125-11-8-unified-rule-engine
**Ticket:** KON-125 (Linear · project Pawly · milestone Epic 11 · blocked by KON-119 / 11-2 + KON-120 / 11-3 · blocks KON-126 / 11-9)
**Origin:** Multi-agent planning audit 2026-07-08 — confirmed critical finding: *"Rule engine in 3 divergent implementations. `evaluateRotationEquity` / `evaluateContractCompliance` push to `softViolations` regardless of `ruleType`; `validateShiftsAgainstRules` ignores `maxWeeklyHours` and does not deduct `breakMinutes`, unlike `preValidateMove` and `scoreAndAssign`. `publishPlan` only blocks on `hard` → HARD contract/rotation violations pass publication."* See `docs/epics-context/epic-11-context.md` § 0 and § 4.

> **Read first:** `docs/epics-context/epic-11-context.md` — audit synthesis, file:line anchors, and the cross-cutting invariants every Epic 11 story MUST preserve. Line numbers below were re-verified against this worktree during authoring (post 11-1..11-6 merge, including 11-3's statutory pass); **re-locate the symbol, do not trust the number blindly.**

## User Story

**As a** maintainer, **I want** a single HARD/SOFT rule evaluator shared by generation, publication, and manual-move validation, **so that** a shift violating a hard rule cannot pass one path while being blocked in another.

## Acceptance Criteria

1. **AC1 — Shared evaluator, correct arithmetic.** **Given** persisted shifts and configured `CONTRACT_COMPLIANCE` / `ROTATION_EQUITY` planning rules, **When** rules are evaluated on any of the three write paths (generation eligibility in `scoreAndAssign`, post-hoc validation in `validateShiftsAgainstRules`, manual-move validation in `preValidateMove`), **Then** all three delegate the rule decision to the shared pure module `rule-engine.ts`: worked minutes are computed **net of `breakMinutes`**, `maxWeeklyHours` is **enforced in validation** (ISO-week bucketed, effective weekly limit = `min(contractHours, maxWeeklyHours)`), and a rule's `ruleType` decides severity (HARD → blocking, SOFT → warning).
2. **AC2 — HARD contract/rotation block publication.** **Given** a month whose persisted shifts breach a **HARD** `CONTRACT_COMPLIANCE` (weekly or monthly) or **HARD** `ROTATION_EQUITY` rule, **When** `validateShiftsAgainstRules` runs (as `publishPlan` invokes it), **Then** those breaches appear in `hardViolations` — no longer silently demoted to `softViolations` — and `publishPlan` rejects with the `409 "hard violation(s) remain"` conflict.
3. **AC3 — Evaluator unit-tested in isolation.** **Given** the extracted pure module `rule-engine.ts` (no NestJS, no Prisma, no I/O — mirroring `french-labor-law.ts`), **When** its unit tests run, **Then** each primitive is covered by a passing, breaching, and boundary case: `netMinutes` break-deduction, weekly + monthly contract with `ruleType`/floor/overtime-tolerance, rotation with `ruleType`/`applicableJobTypes`, and the incremental HARD primitives.
4. **AC4 — No divergence, no regression.** **Given** the three write paths now share the module, **When** existing generation / move / validation behaviour is exercised, **Then** generation determinism is preserved (no RNG change, tiebreakers intact), soft-violation `equityContext` still populates the Planning Health Bar, and every existing test passes — updated where it assumed contract/rotation were soft-only.

**FRs covered:** FR7 (Hard Rules), FR8 (Soft Rule flags). **NFRs:** NFR3 (no silent failure — an illegal roster can no longer be published).

> **Mechanism map (AC → surface, realized in Tasks):** AC1 → new pure module (Task 1) consumed by `validateShiftsAgainstRules` (Task 3), `scoreAndAssign` (Task 5), `preValidateMove` (Task 6). AC2 → Task 3 routes HARD contract/rotation into `hardViolations`; `publishPlan` already blocks on `hard` (no code change — proven by Task 7). AC3 → Task 2 (isolated unit tests). AC4 → Tasks 4/5/6 update the existing specs and preserve `equityContext` + determinism.

> **Scope decisions locked with Alex during authoring (GATE step-04):**
> - **In-app pure module, NOT a new `@pawly/*` package.** The evaluator lives at `apps/api/src/modules/planning/rule-engine.ts`, co-located with the existing pure `french-labor-law.ts`. Rationale: a new workspace package would add turbo `^build` ordering, a jest `moduleNameMapper` entry, and the L5 `.d.ts` build gate, for a shared surface `apps/web` does not need today. The AC's "ideally extracted into a domain package" is satisfied in spirit — the module is framework-free, side-effect-free, and unit-tested in isolation. If `apps/web` later needs it, promoting this file to `@pawly/planning-rules` is a mechanical move (no imports to rewire).
> - **Core shared, orchestration preserved.** The generator keeps its deterministic scoring, tiebreakers, and O(1) incremental counters. Only the *rule decision* (HARD contract weekly/monthly cap, HARD rotation cap) and the *net-minutes* arithmetic are delegated to the module. `scoreAndAssign` already has none of the three defects — its unification is delegating the decision to the same primitive, not a rewrite. Performance is 11-10's concern, not this story's.
> - **Behaviour change accepted.** After this story a **HARD** `CONTRACT_COMPLIANCE` / `ROTATION_EQUITY` rule really blocks publication (the fix). A clinic with such a rule and a non-compliant published-candidate month will see publish refused. The 11-3 statutory rule is **not** affected — its config carries no `maxWeeklyHours` / `maxMonthlyHours`, so the unified contract evaluator emits nothing for it. Existing specs asserting "contract/rotation = soft-only" are updated in Tasks 4/5/6.
> - **Validation contract semantics.** Weekly is evaluated only when `maxWeeklyHours` is set (effective limit `min(contractHours, maxWeeklyHours)`, HARD overtime tolerance); monthly only when `maxMonthlyHours` is set. This mirrors `preValidateMove` and the generator — the validator does not invent a `contractHours` cap when no threshold is configured.
> - **Out of scope (follow-ups, not this story):** the statutory-window inconsistency (`preValidateMove` uses the whole month, `scoreAndAssign`/`createManualShift` use ±8 days — all still call the same `wouldExceedStatutory` from 11-3); the `soft.ruleId: z.string().uuid()` asymmetry in `schedule-view.schema.ts` is left as-is — the unified evaluator emits real rule UUIDs on its soft violations, so it does not trip the validator; noted for a future cleanup.

## Tasks

- [x] **Task 1: Create the pure unified rule-engine module `rule-engine.ts`** [AC: 1, 3]
  Create `apps/api/src/modules/planning/rule-engine.ts` with the full contents below. Pure module — no NestJS, no Prisma, no I/O (same discipline as the sibling `french-labor-law.ts`). This is the single source of truth every path delegates to.
  ```ts
  /**
   * Unified planning rule engine — Story 11-8 (KON-125).
   *
   * Single source of truth for evaluating CONTRACT_COMPLIANCE and ROTATION_EQUITY planning
   * rules, shared by all three write paths: generation eligibility (scoreAndAssign), post-hoc
   * validation (PlanningService.validateShiftsAgainstRules), and manual-move validation
   * (preValidateMove). Pure module — no NestJS, no Prisma, no I/O — mirroring french-labor-law.ts.
   *
   * Fixes the three divergences the 2026-07-08 audit found in the validation path:
   *  (a) contract/rotation now honour ruleType (HARD -> blocking, SOFT -> warning);
   *  (b) maxWeeklyHours is enforced (ISO-week bucketed), not just maxMonthlyHours;
   *  (c) worked minutes are NET of breakMinutes on every path.
   *
   * Times are 'HH:MM' 24h strings; dates are 'YYYY-MM-DD' calendar days interpreted in UTC
   * (matches PlanningGenerationService.getWeekBounds / getPreviousDate). Overnight shifts
   * (endTime <= startTime) wrap past midnight.
   */

  export type RuleType = 'HARD' | 'SOFT';

  /** Minimal rule shape the engine reads (subset of the Prisma PlanningRule row). */
  export interface EvaluatorRule {
    id: string;
    name: string;
    ruleType: RuleType;
    category: string;
    config: Record<string, unknown>;
  }

  /** Minimal per-shift shape the engine needs. `date` = 'YYYY-MM-DD', times = 'HH:MM'. */
  export interface EvalShift {
    employeeId: string;
    contractHours: number;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    jobType?: string;
  }

  /**
   * Unified violation shape — structurally compatible with the service-local HardViolation /
   * SoftViolation (minus `equityContext`, which the service attaches to soft violations).
   */
  export interface RuleViolation {
    ruleId: string;
    ruleName: string;
    category: string;
    message: string;
    messageKey?: string;
    messageParams?: Record<string, string | number>;
    affectedEmployeeId?: string;
    affectedDate?: string;
    severity: 'blocking' | 'warning';
  }

  const MIN_PER_DAY = 1440;

  const DAY_NAME_TO_ISO: Record<string, number> = {
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

  /** Net worked minutes: (end - start) with overnight wrap, minus break. */
  export function netMinutes(startTime: string, endTime: string, breakMinutes = 0): number {
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

  function severityFor(ruleType: RuleType): 'blocking' | 'warning' {
    return ruleType === 'HARD' ? 'blocking' : 'warning';
  }

  /** Overtime tolerance multiplier: HARD rules honour overtimeThresholdPercent; SOFT = 1. */
  function toleranceFor(rule: EvaluatorRule): number {
    return rule.ruleType === 'HARD'
      ? 1 + ((rule.config.overtimeThresholdPercent as number) || 0) / 100
      : 1;
  }

  /**
   * POST-HOC contract-compliance evaluation over a set of shifts (validateShiftsAgainstRules).
   * Emits one violation per (employee, breached ISO week) for maxWeeklyHours and one per
   * employee for maxMonthlyHours. Severity follows ruleType. Worked minutes are NET of
   * breakMinutes. Effective weekly limit = min(contractHours, maxWeeklyHours); monthly limit =
   * maxMonthlyHours. Both scaled by the HARD overtime tolerance (SOFT tolerance = 1).
   */
  export function evaluateContractCompliance(
    rule: EvaluatorRule,
    shifts: EvalShift[],
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const maxWeekly = rule.config.maxWeeklyHours as number | undefined;
    const maxMonthly = rule.config.maxMonthlyHours as number | undefined;
    if (maxWeekly === undefined && maxMonthly === undefined) return violations;

    const tol = toleranceFor(rule);
    const severity = severityFor(rule.ruleType);

    const byEmployee = new Map<string, EvalShift[]>();
    for (const s of shifts) {
      const arr = byEmployee.get(s.employeeId) ?? [];
      arr.push(s);
      byEmployee.set(s.employeeId, arr);
    }

    for (const [employeeId, empShifts] of byEmployee) {
      const contractHours = empShifts[0].contractHours;

      if (maxWeekly !== undefined) {
        const effectiveLimit = Math.min(contractHours, maxWeekly);
        const weekMinutes = new Map<string, number>();
        for (const s of empShifts) {
          const wk = isoWeekStart(s.date);
          weekMinutes.set(
            wk,
            (weekMinutes.get(wk) || 0) + netMinutes(s.startTime, s.endTime, s.breakMinutes),
          );
        }
        for (const [wk, mins] of weekMinutes) {
          if (mins > effectiveLimit * 60 * tol) {
            const hours = Math.round((mins / 60) * 10) / 10;
            violations.push({
              ruleId: rule.id,
              ruleName: rule.name,
              category: rule.category,
              message: `Employee worked ${hours}h in week of ${wk}, exceeds weekly limit ${effectiveLimit}h`,
              messageKey: 'violations.contractCompliance.weeklyOvertime',
              messageParams: {
                currentWeeklyHours: hours,
                maxWeeklyHours: effectiveLimit,
                date: wk,
              },
              affectedEmployeeId: employeeId,
              affectedDate: wk,
              severity,
            });
          }
        }
      }

      if (maxMonthly !== undefined) {
        let total = 0;
        for (const s of empShifts) {
          total += netMinutes(s.startTime, s.endTime, s.breakMinutes);
        }
        if (total > maxMonthly * 60 * tol) {
          const hours = Math.round(total / 60);
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            message: `Employee total ${hours}h exceeds monthly limit ${maxMonthly}h`,
            messageKey: 'violations.contractCompliance.overtime',
            messageParams: { currentMonthlyHours: hours, maxMonthlyHours: maxMonthly },
            affectedEmployeeId: employeeId,
            severity,
          });
        }
      }
    }
    return violations;
  }

  /**
   * POST-HOC rotation-equity evaluation over a set of shifts (validateShiftsAgainstRules).
   * Counts targetDay shifts per employee, emits a violation spread across each affected date
   * when count > maxPerPeriod. Severity follows ruleType. Respects applicableJobTypes.
   */
  export function evaluateRotationEquity(
    rule: EvaluatorRule,
    shifts: EvalShift[],
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];
    const targetDay = rule.config.targetDay as string;
    const maxPerPeriod = rule.config.maxPerPeriod as number;
    const trackingPeriod = (rule.config.trackingPeriod as string) || 'monthly';
    const applicableJobTypes = rule.config.applicableJobTypes as string[] | undefined;
    const targetIso = DAY_NAME_TO_ISO[targetDay];
    if (!targetIso) return violations;

    const severity = severityFor(rule.ruleType);

    const datesByEmployee = new Map<string, string[]>();
    for (const s of shifts) {
      if (
        applicableJobTypes &&
        applicableJobTypes.length > 0 &&
        s.jobType &&
        !applicableJobTypes.includes(s.jobType)
      ) {
        continue;
      }
      if (isoWeekday(s.date) !== targetIso) continue;
      const arr = datesByEmployee.get(s.employeeId) ?? [];
      arr.push(s.date);
      datesByEmployee.set(s.employeeId, arr);
    }

    for (const [employeeId, dates] of datesByEmployee) {
      const count = dates.length;
      if (count > maxPerPeriod) {
        for (const date of dates) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            message: `Employee has ${count} ${targetDay} shifts, exceeds maximum of ${maxPerPeriod} per ${trackingPeriod}`,
            messageKey: 'violations.rotationEquity.exceeded',
            messageParams: { currentCount: count, maxPerPeriod, targetDay, trackingPeriod },
            affectedEmployeeId: employeeId,
            affectedDate: date,
            severity,
          });
        }
      }
    }
    return violations;
  }

  /**
   * INCREMENTAL HARD contract check (scoreAndAssign eligibility + preValidateMove). Returns
   * true if adding `candidateMinutes` (net) would push the employee's week or month past the
   * HARD cap. Effective weekly limit = min(contractHours, maxWeeklyHours), or contractHours
   * when no weekly cap; monthly limit = maxMonthlyHours. Scaled by tolerance. Does NOT cover
   * minRestHoursBetweenShifts — the generator keeps that check inline.
   */
  export function violatesHardContractIncremental(
    rule: EvaluatorRule,
    args: {
      weekMinutes: number;
      monthMinutes: number;
      candidateMinutes: number;
      contractHours: number;
    },
  ): boolean {
    const tol = toleranceFor(rule);
    const maxWeekly = rule.config.maxWeeklyHours as number | undefined;
    const effectiveWeekly = maxWeekly
      ? Math.min(args.contractHours, maxWeekly)
      : args.contractHours;
    if (args.weekMinutes + args.candidateMinutes > effectiveWeekly * 60 * tol) return true;

    const maxMonthly = rule.config.maxMonthlyHours as number | undefined;
    if (maxMonthly && args.monthMinutes + args.candidateMinutes > maxMonthly * 60 * tol) {
      return true;
    }
    return false;
  }

  /**
   * INCREMENTAL HARD rotation check (scoreAndAssign + preValidateMove). `currentCount` = the
   * employee's existing targetDay shifts in the tracking period. Returns true when the cap is
   * already reached (adding one more would exceed it — `count >= maxPerPeriod`, equivalent to
   * the historic `count + 1 > maxPerPeriod`). Respects applicableJobTypes.
   */
  export function violatesHardRotation(
    rule: EvaluatorRule,
    args: { currentCount: number; jobType: string },
  ): boolean {
    const applicableJobTypes = rule.config.applicableJobTypes as string[] | undefined;
    if (
      applicableJobTypes &&
      applicableJobTypes.length > 0 &&
      !applicableJobTypes.includes(args.jobType)
    ) {
      return false;
    }
    const maxPerPeriod = rule.config.maxPerPeriod as number;
    return args.currentCount >= maxPerPeriod;
  }
  ```
  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -20`
  Expected: no error lines referencing `rule-engine.ts`, exit 0.
  Commit: `git add apps/api/src/modules/planning/rule-engine.ts && git commit -m "feat(KON-125): add unified pure rule-engine module"`

- [x] **Task 2: Unit-test the rule engine in isolation** [AC: 3]
  Create `apps/api/src/modules/planning/rule-engine.spec.ts`. Cover each export with passing / breaching / boundary cases. Minimum cases below (add more if a branch is uncovered).
  ```ts
  import {
    netMinutes,
    isoWeekStart,
    isoWeekday,
    evaluateContractCompliance,
    evaluateRotationEquity,
    violatesHardContractIncremental,
    violatesHardRotation,
    type EvaluatorRule,
    type EvalShift,
  } from './rule-engine';

  const rule = (
    ruleType: 'HARD' | 'SOFT',
    category: string,
    config: Record<string, unknown>,
  ): EvaluatorRule => ({ id: 'r1', name: 'Test rule', ruleType, category, config });

  const shift = (
    employeeId: string,
    date: string,
    startTime: string,
    endTime: string,
    breakMinutes = 0,
    contractHours = 35,
    jobType?: string,
  ): EvalShift => ({ employeeId, contractHours, date, startTime, endTime, breakMinutes, jobType });

  describe('primitives', () => {
    it('netMinutes deducts break and wraps overnight', () => {
      expect(netMinutes('08:00', '18:00', 60)).toBe(540); // 10h - 1h
      expect(netMinutes('22:00', '06:00', 0)).toBe(480); // 8h overnight
    });
    it('isoWeekStart returns the Monday of the ISO week (UTC)', () => {
      expect(isoWeekStart('2026-08-05')).toBe('2026-08-03'); // Wed -> Mon
      expect(isoWeekStart('2026-08-09')).toBe('2026-08-03'); // Sun -> Mon
    });
    it('isoWeekday maps Sunday to 7', () => {
      expect(isoWeekday('2026-08-03')).toBe(1); // Monday
      expect(isoWeekday('2026-08-08')).toBe(6); // Saturday
      expect(isoWeekday('2026-08-09')).toBe(7); // Sunday
    });
  });

  describe('evaluateContractCompliance — weekly (maxWeeklyHours)', () => {
    it('HARD weekly overage -> blocking, deducting breakMinutes', () => {
      // Mon-Sat 09:00-18:00 with 0 break = 9h/day x 6 = 54h > 35h
      const shifts = ['03', '04', '05', '06', '07', '08'].map((d) =>
        shift('e1', `2026-08-${d}`, '09:00', '18:00', 0),
      );
      const v = evaluateContractCompliance(rule('HARD', 'CONTRACT_COMPLIANCE', { maxWeeklyHours: 35 }), shifts);
      expect(v).toHaveLength(1);
      expect(v[0]).toMatchObject({ severity: 'blocking', affectedDate: '2026-08-03' });
      expect(v[0].messageKey).toBe('violations.contractCompliance.weeklyOvertime');
    });
    it('SOFT weekly overage -> warning', () => {
      const shifts = ['03', '04', '05', '06', '07', '08'].map((d) =>
        shift('e1', `2026-08-${d}`, '09:00', '18:00', 0),
      );
      const v = evaluateContractCompliance(rule('SOFT', 'CONTRACT_COMPLIANCE', { maxWeeklyHours: 35 }), shifts);
      expect(v[0].severity).toBe('warning');
    });
    it('effective limit floors to min(contractHours, maxWeeklyHours)', () => {
      // 25h contract, rule 35h -> effective 25h. 3 x 9h = 27h > 25h.
      const shifts = ['03', '04', '05'].map((d) =>
        shift('e1', `2026-08-${d}`, '09:00', '18:00', 0, 25),
      );
      const v = evaluateContractCompliance(rule('HARD', 'CONTRACT_COMPLIANCE', { maxWeeklyHours: 35 }), shifts);
      expect(v).toHaveLength(1);
    });
    it('HARD overtimeThresholdPercent widens the limit', () => {
      // 35h x 1.10 = 38.5h. 4 x 9h = 36h -> under tolerance, no violation.
      const shifts = ['03', '04', '05', '06'].map((d) =>
        shift('e1', `2026-08-${d}`, '09:00', '18:00', 0, 40),
      );
      const v = evaluateContractCompliance(
        rule('HARD', 'CONTRACT_COMPLIANCE', { maxWeeklyHours: 35, overtimeThresholdPercent: 10 }),
        shifts,
      );
      expect(v).toHaveLength(0);
    });
  });

  describe('evaluateContractCompliance — monthly (maxMonthlyHours)', () => {
    it('HARD monthly overage -> blocking', () => {
      const shifts = Array.from({ length: 20 }, (_, i) =>
        shift('e1', `2026-08-${String((i % 28) + 1).padStart(2, '0')}`, '08:00', '18:00', 0),
      ); // 20 x 10h = 200h > 150h
      const v = evaluateContractCompliance(rule('HARD', 'CONTRACT_COMPLIANCE', { maxMonthlyHours: 150 }), shifts);
      expect(v.some((x) => x.severity === 'blocking' && x.messageKey === 'violations.contractCompliance.overtime')).toBe(true);
    });
    it('no threshold configured -> no violations', () => {
      const shifts = [shift('e1', '2026-08-03', '08:00', '20:00', 0)];
      expect(evaluateContractCompliance(rule('HARD', 'CONTRACT_COMPLIANCE', {}), shifts)).toHaveLength(0);
    });
  });

  describe('evaluateRotationEquity', () => {
    it('HARD rotation overage -> blocking, spread across dates', () => {
      // 3 Saturdays, max 2
      const shifts = ['01', '08', '15'].map((d) => shift('e1', `2026-08-${d}`, '09:00', '15:00'));
      const v = evaluateRotationEquity(
        rule('HARD', 'ROTATION_EQUITY', { targetDay: 'saturday', maxPerPeriod: 2, trackingPeriod: 'monthly' }),
        shifts,
      );
      expect(v).toHaveLength(3);
      expect(v.every((x) => x.severity === 'blocking')).toBe(true);
    });
    it('SOFT rotation overage -> warning', () => {
      const shifts = ['01', '08', '15'].map((d) => shift('e1', `2026-08-${d}`, '09:00', '15:00'));
      const v = evaluateRotationEquity(
        rule('SOFT', 'ROTATION_EQUITY', { targetDay: 'saturday', maxPerPeriod: 2, trackingPeriod: 'monthly' }),
        shifts,
      );
      expect(v[0].severity).toBe('warning');
    });
    it('respects applicableJobTypes', () => {
      const shifts = ['01', '08', '15'].map((d) => shift('e1', `2026-08-${d}`, '09:00', '15:00', 0, 35, 'VET'));
      const v = evaluateRotationEquity(
        rule('HARD', 'ROTATION_EQUITY', { targetDay: 'saturday', maxPerPeriod: 2, applicableJobTypes: ['ASV'] }),
        shifts,
      );
      expect(v).toHaveLength(0); // VET not in [ASV]
    });
    it('does not flag exactly maxPerPeriod', () => {
      const shifts = ['01', '08'].map((d) => shift('e1', `2026-08-${d}`, '09:00', '15:00'));
      const v = evaluateRotationEquity(
        rule('HARD', 'ROTATION_EQUITY', { targetDay: 'saturday', maxPerPeriod: 2 }),
        shifts,
      );
      expect(v).toHaveLength(0);
    });
  });

  describe('incremental HARD primitives', () => {
    it('violatesHardContractIncremental blocks when candidate tips over the weekly cap', () => {
      const r = rule('HARD', 'CONTRACT_COMPLIANCE', { maxWeeklyHours: 35 });
      expect(
        violatesHardContractIncremental(r, { weekMinutes: 30 * 60, monthMinutes: 0, candidateMinutes: 6 * 60, contractHours: 35 }),
      ).toBe(true); // 36h > 35h
      expect(
        violatesHardContractIncremental(r, { weekMinutes: 20 * 60, monthMinutes: 0, candidateMinutes: 6 * 60, contractHours: 35 }),
      ).toBe(false); // 26h
    });
    it('violatesHardRotation blocks at the cap and honours applicableJobTypes', () => {
      const r = rule('HARD', 'ROTATION_EQUITY', { targetDay: 'saturday', maxPerPeriod: 2, applicableJobTypes: ['ASV'] });
      expect(violatesHardRotation(r, { currentCount: 2, jobType: 'ASV' })).toBe(true);
      expect(violatesHardRotation(r, { currentCount: 1, jobType: 'ASV' })).toBe(false);
      expect(violatesHardRotation(r, { currentCount: 5, jobType: 'VET' })).toBe(false); // not applicable
    });
  });
  ```
  Run: `pnpm --filter @pawly/api test -- rule-engine`
  Expected: `Tests:` all passed (≥ 15 passing), exit 0.
  Commit: `git add apps/api/src/modules/planning/rule-engine.spec.ts && git commit -m "test(KON-125): unit-test the unified rule engine"`

- [x] **Task 3: Wire `validateShiftsAgainstRules` onto the shared engine (the security fix)** [AC: 1, 2, 4]
  In `apps/api/src/modules/planning/planning.service.ts`, make the contract + rotation evaluators delegate the decision to `rule-engine.ts`, routing HARD vs SOFT by the rule's `ruleType`, while preserving each soft violation's `equityContext`.

  **(a) Add the import** immediately after the `./french-labor-law` import block (currently ends line 34):
  ```ts
  import {
    netMinutes,
    evaluateContractCompliance as engineEvaluateContractCompliance,
    evaluateRotationEquity as engineEvaluateRotationEquity,
    type EvalShift,
    type RuleType,
  } from './rule-engine';
  ```

  **(b) Pass `hardViolations` to the contract + rotation arms of the switch.** Anchor on the two arms (currently lines 211–228):
  ```ts
        case 'ROTATION_EQUITY':
          this.evaluateRotationEquity(
            rule,
            config,
            validShifts,
            softViolations,
            options?.equityCounters,
          );
          break;
        case 'CONTRACT_COMPLIANCE':
          this.evaluateContractCompliance(
            rule,
            config,
            validShifts,
            softViolations,
            options?.equityCounters,
          );
          break;
  ```
  Replace with (add `hardViolations` before `softViolations`):
  ```ts
        case 'ROTATION_EQUITY':
          this.evaluateRotationEquity(
            rule,
            config,
            validShifts,
            hardViolations,
            softViolations,
            options?.equityCounters,
          );
          break;
        case 'CONTRACT_COMPLIANCE':
          this.evaluateContractCompliance(
            rule,
            config,
            validShifts,
            hardViolations,
            softViolations,
            options?.equityCounters,
          );
          break;
  ```

  **(c) Replace `evaluateRotationEquity` (currently lines 405–513) in full** with the delegating adapter (note the new `rule.ruleType` field, the `hardViolations` param, and the `s.employee.jobType` mapping for `applicableJobTypes`):
  ```ts
    private evaluateRotationEquity(
      rule: { id: string; name: string; category: string; ruleType: string },
      config: Record<string, unknown>,
      shifts: Array<{ date: Date; employee: { id: string; jobType?: string } }>,
      hardViolations: HardViolation[],
      softViolations: SoftViolation[],
      equityCounters?: CounterWithEmployee[],
    ) {
      const evalShifts: EvalShift[] = shifts.map((s) => ({
        employeeId: s.employee.id,
        contractHours: 0,
        date: s.date.toISOString().split('T')[0],
        startTime: '00:00',
        endTime: '00:00',
        breakMinutes: 0,
        jobType: s.employee.jobType,
      }));

      const results = engineEvaluateRotationEquity(
        {
          id: rule.id,
          name: rule.name,
          ruleType: rule.ruleType as RuleType,
          category: rule.category,
          config,
        },
        evalShifts,
      );
      if (results.length === 0) return;

      const targetDay = config.targetDay as string;
      const maxPerPeriod = config.maxPerPeriod as number;
      const counterType =
        targetDay === 'saturday' ? 'SATURDAY_WORKED' : `${targetDay.toUpperCase()}_SHIFTS`;
      const clinicAverage = this.computeRotationClinicAverage(
        evalShifts,
        equityCounters,
        targetDay,
      );

      for (const v of results) {
        if (v.severity === 'blocking') {
          hardViolations.push({
            ...v,
            category: v.category as PlanningRuleCategory,
            severity: 'blocking' as const,
          });
        } else {
          const count = Number(v.messageParams?.currentCount ?? 0);
          const trend: EquityContext['trend'] =
            count > clinicAverage + 0.5
              ? 'above_average'
              : count < clinicAverage - 0.5
                ? 'below_average'
                : 'average';
          softViolations.push({
            ...v,
            category: v.category as PlanningRuleCategory,
            severity: 'warning' as const,
            equityContext: {
              counterType,
              currentCount: count,
              maxPerPeriod,
              clinicAverage: Math.round(clinicAverage * 10) / 10,
              trend,
            },
          });
        }
      }
    }

    /** Clinic average targetDay count (equity trend context) — preserved from prior behaviour. */
    private computeRotationClinicAverage(
      evalShifts: EvalShift[],
      equityCounters: CounterWithEmployee[] | undefined,
      targetDay: string,
    ): number {
      const counterType = targetDay === 'saturday' ? 'SATURDAY_WORKED' : undefined;
      if (equityCounters && counterType) {
        const relevant = equityCounters.filter((c) => c.counterType === counterType);
        if (relevant.length > 0) {
          return relevant.reduce((sum, c) => sum + c.count, 0) / relevant.length;
        }
      }
      const dayNameToIso: Record<string, number> = {
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        sunday: 7,
      };
      const targetIso = dayNameToIso[targetDay];
      const countByEmployee = new Map<string, number>();
      for (const s of evalShifts) {
        const d = new Date(`${s.date}T00:00:00.000Z`);
        const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
        if (iso !== targetIso) continue;
        countByEmployee.set(s.employeeId, (countByEmployee.get(s.employeeId) || 0) + 1);
      }
      const counts = Array.from(countByEmployee.values());
      return counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    }
  ```

  **(d) Replace `evaluateContractCompliance` (currently lines 515–616) in full** with the delegating adapter (note the new `breakMinutes` in the shift type, the `rule.ruleType` field, and the `hardViolations` param). This is where defects (b) `maxWeeklyHours` and (c) `breakMinutes` are fixed — the shifts already carry `breakMinutes` at runtime (the loader uses `include: { employee }`, so all Shift scalars are present; only the type needs widening):
  ```ts
    private evaluateContractCompliance(
      rule: { id: string; name: string; category: string; ruleType: string },
      config: Record<string, unknown>,
      shifts: Array<{
        date: Date;
        startTime: string;
        endTime: string;
        breakMinutes: number;
        employee: { id: string; contractHours: number };
      }>,
      hardViolations: HardViolation[],
      softViolations: SoftViolation[],
      equityCounters?: CounterWithEmployee[],
    ) {
      const evalShifts: EvalShift[] = shifts.map((s) => ({
        employeeId: s.employee.id,
        contractHours: s.employee.contractHours,
        date: s.date.toISOString().split('T')[0],
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
      }));

      const results = engineEvaluateContractCompliance(
        {
          id: rule.id,
          name: rule.name,
          ruleType: rule.ruleType as RuleType,
          category: rule.category,
          config,
        },
        evalShifts,
      );
      if (results.length === 0) return;

      const clinicAverageHours = this.computeClinicAverageHours(evalShifts, equityCounters);

      for (const v of results) {
        if (v.severity === 'blocking') {
          hardViolations.push({
            ...v,
            category: v.category as PlanningRuleCategory,
            severity: 'blocking' as const,
          });
        } else {
          const currentHours = Number(
            v.messageParams?.currentMonthlyHours ?? v.messageParams?.currentWeeklyHours ?? 0,
          );
          const maxHours = Number(
            v.messageParams?.maxMonthlyHours ?? v.messageParams?.maxWeeklyHours ?? 0,
          );
          const trend: EquityContext['trend'] =
            currentHours > clinicAverageHours + 2
              ? 'above_average'
              : currentHours < clinicAverageHours - 2
                ? 'below_average'
                : 'average';
          softViolations.push({
            ...v,
            category: v.category as PlanningRuleCategory,
            severity: 'warning' as const,
            equityContext: {
              counterType: 'OVERTIME_HOURS',
              currentCount: currentHours,
              maxPerPeriod: maxHours,
              clinicAverage: Math.round(clinicAverageHours * 10) / 10,
              trend,
            },
          });
        }
      }
    }

    /** Clinic average monthly hours (equity trend context) — preserved from prior behaviour. */
    private computeClinicAverageHours(
      evalShifts: EvalShift[],
      equityCounters?: CounterWithEmployee[],
    ): number {
      const minutesByEmployee = new Map<string, number>();
      for (const s of evalShifts) {
        minutesByEmployee.set(
          s.employeeId,
          (minutesByEmployee.get(s.employeeId) || 0) +
            netMinutes(s.startTime, s.endTime, s.breakMinutes),
        );
      }
      const perEmployeeHours = Array.from(minutesByEmployee.values()).map((m) => m / 60);
      const currentAvg =
        perEmployeeHours.length > 0
          ? perEmployeeHours.reduce((a, b) => a + b, 0) / perEmployeeHours.length
          : 0;
      if (equityCounters) {
        const overtime = equityCounters.filter((c) => c.counterType === 'OVERTIME_HOURS');
        if (overtime.length > 0) {
          const avgHist = overtime.reduce((sum, c) => sum + c.count, 0) / overtime.length / 60;
          return currentAvg + avgHist;
        }
      }
      return currentAvg;
    }
  ```

  **(e) Remove the now-unused private `calculateShiftMinutes` (currently lines 618–626).** It was only called by the old `evaluateContractCompliance`; the shared `netMinutes` replaces it. Delete the whole method:
  ```ts
    private calculateShiftMinutes(startTime: string, endTime: string): number {
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return endMinutes >= startMinutes
        ? endMinutes - startMinutes
        : 1440 - startMinutes + endMinutes;
    }
  ```
  (If `tsc` reports `calculateShiftMinutes` still referenced elsewhere, keep it — but a grep of `planning.service.ts` should show zero other callers.)

  **(f)** Confirm the Prisma loader already selects break/time fields. The `shift.findMany` at ~line 171 uses `include: { employee: { select: … } }` (NOT a scalar `select`), so every `Shift` scalar — `date`, `startTime`, `endTime`, `breakMinutes` — is already returned. **No loader change is required**; only the method parameter types were widened in (c)/(d).

  Run: `pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json 2>&1 | head -30`
  Expected: exit 0, no errors referencing `planning.service.ts` or `rule-engine`.
  Commit: `git add apps/api/src/modules/planning/planning.service.ts && git commit -m "feat(KON-125): validateShiftsAgainstRules honors ruleType via shared engine"`

- [x] **Task 4: Spec the validation path — HARD contract/rotation now surface as `hardViolations`** [AC: 1, 2, 4]
  In `apps/api/src/modules/planning/planning.service.spec.ts`, add a new `describe` block. The existing mock scaffold (`mockPrismaService.planningRule.findMany`, `mockPrismaService.shift.findMany`) is reused. Add these helpers + cases at the end of the top-level `describe('PlanningService', …)` block (before its closing `});`):
  ```ts
  // ─── validateShiftsAgainstRules — unified rule engine (Story 11-8) ───────────
  describe('validateShiftsAgainstRules — unified engine', () => {
    const empShift = (
      id: string,
      employeeId: string,
      date: string,
      startTime: string,
      endTime: string,
      breakMinutes = 0,
      contractHours = 35,
      jobType = 'VET',
    ) => ({
      id,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime,
      endTime,
      shiftTypeCode: 'CHIR',
      breakMinutes,
      employeeId,
      clinicId,
      employee: { id: employeeId, jobType, contractHours },
    });

    const contractRule = (ruleType: 'HARD' | 'SOFT', config: Record<string, unknown>) => ({
      id: 'rule-cc',
      name: 'Contract cap',
      ruleType,
      category: 'CONTRACT_COMPLIANCE',
      isActive: true,
      config,
      priority: 0,
      clinicId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rotationRule = (ruleType: 'HARD' | 'SOFT', config: Record<string, unknown>) => ({
      id: 'rule-rot',
      name: 'Rotation cap',
      ruleType,
      category: 'ROTATION_EQUITY',
      isActive: true,
      config,
      priority: 0,
      clinicId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const input = { startDate: '2026-08-01T00:00:00.000Z', endDate: '2026-08-31T23:59:59.999Z' };

    it('HARD CONTRACT_COMPLIANCE weekly overage -> hardViolations (blocks publish)', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        contractRule('HARD', { maxWeeklyHours: 35 }),
      ]);
      // Mon-Sat 09:00-18:00 (9h/day x 6 = 54h) in one ISO week
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['03', '04', '05', '06', '07', '08'].map((d, i) =>
          empShift(`s${i}`, 'e1', `2026-08-${d}`, '09:00', '18:00', 0),
        ),
      );
      const res = await service.validateShiftsAgainstRules(clinicId, input);
      expect(res.hardViolations.some((v) => v.category === 'CONTRACT_COMPLIANCE')).toBe(true);
      expect(res.softViolations.some((v) => v.category === 'CONTRACT_COMPLIANCE')).toBe(false);
    });

    it('SOFT CONTRACT_COMPLIANCE monthly overage -> softViolations with equityContext', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        contractRule('SOFT', { maxMonthlyHours: 40 }),
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['03', '04', '05', '06', '07', '08'].map((d, i) =>
          empShift(`s${i}`, 'e1', `2026-08-${d}`, '08:00', '18:00', 0),
        ), // 6 x 10h = 60h > 40h
      );
      const res = await service.validateShiftsAgainstRules(clinicId, input);
      const soft = res.softViolations.find((v) => v.category === 'CONTRACT_COMPLIANCE');
      expect(soft).toBeDefined();
      expect(soft?.equityContext).toBeDefined();
      expect(res.hardViolations.some((v) => v.category === 'CONTRACT_COMPLIANCE')).toBe(false);
    });

    it('deducts breakMinutes: 5 x (08:00-16:00 net 7h) = 35h is NOT over a 35h HARD cap', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        contractRule('HARD', { maxWeeklyHours: 35 }),
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['03', '04', '05', '06', '07'].map((d, i) =>
          empShift(`s${i}`, 'e1', `2026-08-${d}`, '08:00', '16:00', 60), // 8h gross - 1h = 7h net
        ),
      );
      const res = await service.validateShiftsAgainstRules(clinicId, input);
      // Would be 40h gross (> 35, violation) if break were ignored; 35h net = at the limit, no violation.
      expect(res.hardViolations.some((v) => v.category === 'CONTRACT_COMPLIANCE')).toBe(false);
    });

    it('HARD ROTATION_EQUITY overage -> hardViolations', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        rotationRule('HARD', { targetDay: 'saturday', maxPerPeriod: 2, trackingPeriod: 'monthly' }),
      ]);
      // Saturdays 2026-08-01, 08, 15 = 3 > 2
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['01', '08', '15'].map((d, i) => empShift(`s${i}`, 'e1', `2026-08-${d}`, '09:00', '15:00', 0)),
      );
      const res = await service.validateShiftsAgainstRules(clinicId, input);
      expect(res.hardViolations.some((v) => v.category === 'ROTATION_EQUITY')).toBe(true);
    });
  });
  ```
  **Also update any pre-existing case** in this spec that asserts a HARD `CONTRACT_COMPLIANCE` / `ROTATION_EQUITY` rule produces a `softViolation` — after this story such a rule produces a `hardViolation`. Search the file for `ROTATION_EQUITY` / `CONTRACT_COMPLIANCE` assertions and flip `softViolations` → `hardViolations` where the mocked rule's `ruleType` is `'HARD'`.
  Run: `pnpm --filter @pawly/api test -- planning.service`
  Expected: `Tests:` all passed (existing + new), exit 0.
  Commit: `git add apps/api/src/modules/planning/planning.service.spec.ts && git commit -m "test(KON-125): cover HARD contract/rotation surfacing in validation"`

- [x] **Task 5: Delegate the generation HARD contract + rotation decision to the engine** [AC: 1, 4]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, keep the generator's orchestration (scoring, tiebreakers, incremental counters) untouched — only route the HARD *decision* through the shared engine.

  **(a) Add the import** after the `./french-labor-law` import (currently line 20):
  ```ts
  import {
    violatesHardContractIncremental,
    violatesHardRotation,
    type RuleType,
  } from './rule-engine';
  ```

  **(b) Replace the weekly + monthly HARD contract math** inside the `scoreAndAssign` eligibility loop (currently lines 1028–1048) — anchor on:
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
  ```
  Replace with (delegate weekly+monthly to the engine; keep the `minRest` block that follows untouched):
  ```ts
      // HARD CONTRACT_COMPLIANCE — Story 11-8: weekly + monthly caps delegated to the shared
      // rule engine (single source of truth). minRest stays inline below.
      for (const rule of hardContractRules) {
        const config = rule.config;

        if (
          violatesHardContractIncremental(
            {
              id: rule.id,
              name: rule.name,
              ruleType: 'HARD' as RuleType,
              category: rule.category,
              config,
            },
            {
              weekMinutes: weeklyMinutesMap.get(emp.id) || 0,
              monthMinutes: employeeMinutes.get(emp.id) || 0,
              candidateMinutes: slotMinutes,
              contractHours: emp.contractHours,
            },
          )
        ) {
          return false;
        }

        // MIN_REST_HOURS: check minimum rest between consecutive shifts
  ```
  (Note: `rule.id` / `rule.name` exist on the `RuleEntry` type — the same object already exposes `rule.config` and `rule.category` here. If the local `RuleEntry` type omits `id`/`name`, widen it or pass `rule.id ?? ''` / `rule.name ?? ''`.)

  **(c) Delegate the HARD rotation decision** at the end of `violatesHardRotationEquity` (currently lines 3497–3505) — anchor on:
  ```ts
      const count = shiftPool.filter((a) => {
        if (a.employeeId !== employee.id) return false;
        const d = new Date(`${a.date}T00:00:00.000Z`);
        const aIsoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
        return aIsoDay === targetIsoDay;
      }).length;

      return count >= maxPerPeriod;
    }
  ```
  Replace the final `return` with a call to the shared primitive (the `applicableJobTypes` short-circuit above already handles job-type filtering, so this is purely the cap decision):
  ```ts
      const count = shiftPool.filter((a) => {
        if (a.employeeId !== employee.id) return false;
        const d = new Date(`${a.date}T00:00:00.000Z`);
        const aIsoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
        return aIsoDay === targetIsoDay;
      }).length;

      return violatesHardRotation(
        {
          id: rule.id,
          name: rule.name,
          ruleType: 'HARD' as RuleType,
          category: rule.category,
          config: rule.config,
        },
        { currentCount: count, jobType: employee.jobType },
      );
    }
  ```
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add one determinism-preservation test: a clinic with a HARD `CONTRACT_COMPLIANCE { maxWeeklyHours: 35 }` rule and demand that would push an employee past 35h net/week leaves a hole (or picks another employee) — same outcome as before the refactor. If a generation fixture already exercises HARD weekly caps, assert it still produces the identical assignment set.
  Run: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: `Tests:` all passed, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "feat(KON-125): generation delegates HARD contract/rotation to shared engine"`

- [x] **Task 6: Delegate the manual-move contract + rotation decision to the engine** [AC: 1, 4]
  In `apps/api/src/modules/planning/planning-generation.service.ts`, inside `preValidateMove`, route the contract + rotation decisions through the same primitives (keep the terse `{ rule, message }` output shape the drag UI expects).

  **(a) Replace the CONTRACT_COMPLIANCE rule loop** (currently lines 2611–2632) — anchor on:
  ```ts
      for (const rule of rules.filter(
        (r) => r.category === 'CONTRACT_COMPLIANCE',
      )) {
        const config = rule.config as Record<string, unknown>;
        const maxWeekly = config.maxWeeklyHours as number | undefined;
        const overtimeTol =
          rule.ruleType === 'HARD'
            ? 1 + ((config.overtimeThresholdPercent as number) || 0) / 100
            : 1;
        const effectiveLimit = maxWeekly
          ? Math.min(employee.contractHours, maxWeekly)
          : employee.contractHours;

        if (projectedWeeklyMinutes > effectiveLimit * 60 * overtimeTol) {
          const bucket = rule.ruleType === 'HARD' ? hard : soft;
          bucket.push({
            rule: 'CONTRACT_COMPLIANCE',
            message: `Overtime risk: ${projectedWeeklyHours}h this week, effective limit ${effectiveLimit}h`,
          });
          break;
        }
      }
  ```
  Replace with (delegate the weekly decision to the shared engine; `monthMinutes: 0` keeps the move's weekly-only behaviour — no monthly cap is evaluated on a move):
  ```ts
      for (const rule of rules.filter(
        (r) => r.category === 'CONTRACT_COMPLIANCE',
      )) {
        const config = rule.config as Record<string, unknown>;
        const maxWeekly = config.maxWeeklyHours as number | undefined;
        const effectiveLimit = maxWeekly
          ? Math.min(employee.contractHours, maxWeekly)
          : employee.contractHours;

        // Story 11-8 — weekly cap decision delegated to the shared rule engine.
        if (
          violatesHardContractIncremental(
            {
              id: rule.id,
              name: rule.name,
              ruleType: rule.ruleType as RuleType,
              category: rule.category,
              config: { ...config, maxMonthlyHours: undefined },
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
  ```
  (`maxMonthlyHours: undefined` in the passed config guarantees the shared primitive only evaluates the weekly cap here, matching the move's historic weekly-only semantics.)

  **(b) Replace the ROTATION_EQUITY threshold check** (currently lines 2714–2720) — anchor on:
  ```ts
        if (targetDayCount + 1 > maxPerPeriod) {
          const bucket = rule.ruleType === 'HARD' ? hard : soft;
          bucket.push({
            rule: 'ROTATION_EQUITY',
            message: `${employee.firstName} ${employee.lastName} — would be ${targetDayCount + 1}th ${targetDay} this ${trackingPeriod || 'month'} (max ${maxPerPeriod})`,
          });
        }
  ```
  Replace with (delegate to the shared primitive; `count >= maxPerPeriod` ≡ `count + 1 > maxPerPeriod`):
  ```ts
        if (
          violatesHardRotation(
            {
              id: rule.id,
              name: rule.name,
              ruleType: rule.ruleType as RuleType,
              category: rule.category,
              config: rule.config as Record<string, unknown>,
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
  ```
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add: (1) `preValidateMove` returns a `hard` entry with `rule: 'CONTRACT_COMPLIANCE'` when moving a shift pushes the employee's week past a HARD `maxWeeklyHours`; (2) a SOFT `maxWeeklyHours` rule produces a `soft` entry, not `hard`.
  Run: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: `Tests:` all passed, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.ts apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "feat(KON-125): preValidateMove delegates contract/rotation to shared engine"`

- [x] **Task 7: Prove publication is blocked by a HARD contract violation** [AC: 2]
  No production code changes — `publishPlan` (currently line 2799) already throws `ConflictException` when `validateShiftsAgainstRules` returns any `hardViolations`. This test closes the loop (L-audit: *"verified means every guard entry-point"*): before this story, a HARD contract/rotation rule could never produce a hard violation, so this path was unreachable.
  In `apps/api/src/modules/planning/planning-generation.service.spec.ts`, add (wire the two mocks to the file's existing `mockPlanningService` / `mockPrisma` doubles — the injected `PlanningService` mock must expose `validateShiftsAgainstRules`):
  ```ts
  describe('publishPlan — blocks on HARD contract violation (Story 11-8)', () => {
    it('rejects with ConflictException when a HARD CONTRACT_COMPLIANCE violation remains', async () => {
      // Not already published -> pre-check runs.
      mockPrisma.planningPeriodStatus.findUnique.mockResolvedValue(null);
      mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
        hardViolations: [
          {
            ruleId: 'rule-cc',
            ruleName: 'Contract cap',
            category: 'CONTRACT_COMPLIANCE',
            message: 'weekly overage',
            affectedEmployeeId: 'e1',
            severity: 'blocking',
          },
        ],
        softViolations: [],
        rules: [],
      });

      await expect(service.publishPlan('clinic-123', '2026-08', 'user-1')).rejects.toThrow(
        /hard violation\(s\) remain/,
      );
    });
  });
  ```
  (If the spec's Prisma double does not yet stub `planningPeriodStatus.findUnique`, add it to the mock alongside the other `prisma.*` stubs. The `ConflictException` is thrown before any transaction/advisory-lock code, so no further mocks are needed.)
  Run: `pnpm --filter @pawly/api test -- planning-generation.service`
  Expected: `Tests:` all passed, exit 0.
  Commit: `git add apps/api/src/modules/planning/planning-generation.service.spec.ts && git commit -m "test(KON-125): publish blocked by HARD contract violation"`

- [x] **Task 8: Localize the new weekly-overtime hard/soft violation (fr/en)** [AC: 1]
  The unified contract evaluator emits a new `messageKey: 'violations.contractCompliance.weeklyOvertime'` for weekly caps (the monthly `overtime` key already exists). Add its translation so the Planning Health Bar renders it (the popover already resolves `messageKey` via `t(...)` since story 11-3).
  **(a)** In `apps/web/src/i18n/langs/fr.json`, inside `admin.planningRules.healthBar.violations.contractCompliance` (currently holds only `"overtime"`), add the `weeklyOvertime` sibling:
  ```json
  "weeklyOvertime": "{currentWeeklyHours}h la semaine du {date}, dépasse la limite hebdomadaire de {maxWeeklyHours}h"
  ```
  **(b)** In `apps/web/src/i18n/langs/en.json`, inside the same `admin.planningRules.healthBar.violations.contractCompliance` object, add:
  ```json
  "weeklyOvertime": "{currentWeeklyHours}h in the week of {date}, exceeds the weekly limit of {maxWeeklyHours}h"
  ```
  (Add the key next to `"overtime"`; mind the trailing comma so the JSON stays valid.)
  Run: `pnpm --filter @pawly/web exec tsc --noEmit && node -e "JSON.parse(require('fs').readFileSync('apps/web/src/i18n/langs/fr.json','utf8'));JSON.parse(require('fs').readFileSync('apps/web/src/i18n/langs/en.json','utf8'));console.log('json ok')"`
  Expected: `tsc` exit 0 (no output) and `json ok` printed (both files parse).
  Commit: `git add apps/web/src/i18n/langs/fr.json apps/web/src/i18n/langs/en.json && git commit -m "feat(KON-125): localize weekly-overtime violation (fr/en)"`

- [x] **Task 9: Typecheck + full test sweep across affected packages** [AC: 1, 2, 3, 4]
  Run each and confirm green:
  ```bash
  pnpm --filter @pawly/api exec tsc --noEmit -p tsconfig.json
  pnpm --filter @pawly/api test -- rule-engine planning.service planning-generation.service
  pnpm --filter @pawly/web exec tsc --noEmit
  ```
  Expected: every `tsc --noEmit` exits 0 with no output; every test run reports all passed, exit 0. Per lesson **L5**, if the API declaration build matters for consumers, also run `pnpm --filter @pawly/api exec tsc -p tsconfig.types.json` (must exit 0). If any fix is needed, fold it into the relevant task's commit.
  Commit: none (verification only).

- [x] **Task 10: Live verification (headed) — one path can no longer diverge from another** [AC: 1, 2]
  With `pnpm dev` running (web:3020 / API:3001 per the L2-journey memo — confirm the live ports before driving), sign in as the seed admin, repoint to the "Simulation E2E" clinic if needed. Use `mcp__react-grab-mcp__get_element_context` at the GREEN check on the Health Bar (frontend visual verification is mandatory per CLAUDE.md).
  1. **Create a HARD contract rule.** In Settings → Planning Rules, add a HARD `CONTRACT_COMPLIANCE` rule with `maxWeeklyHours` low enough that the current month breaches it for at least one employee (e.g. 20h).
  2. **Health Bar surfaces it as HARD + publish blocked.** Open the Planning Health Bar detail popover; confirm a red HARD entry under "Conformité contrat" with the localized weekly message, and that Publish is disabled / `publishPlan` returns the 409 "hard violation(s) remain". Before this story the same rule showed only as a soft warning and publication succeeded.
  3. **Drag consistency.** Drag a shift that would push an employee past that HARD weekly limit; confirm the drag surfaces a blocking (hard) conflict — the same verdict the Health Bar and the generator now give.
  Record findings in the Dev Agent Record → Completion Notes. No commit unless a fix is required.

## Dev Notes

### Architecture & data flow
- **Mandatory flow** (unchanged): `Page (RSC) → Client Component → Hook → Zsa → Server Action → tRPC → NestJS Service → Prisma`. This story is almost entirely NestJS-service; the only web change (Task 8) is two i18n keys.
- **The shared module is the single source of truth.** `rule-engine.ts` is a pure module (no NestJS/Prisma/I/O) — same discipline as the co-located `french-labor-law.ts`. All three write paths import from it: `PlanningService.validateShiftsAgainstRules` (post-hoc, Health Bar + publish gate), `PlanningGenerationService.scoreAndAssign` (generation eligibility), `PlanningGenerationService.preValidateMove` (drag). `publishPlan` blocks on `hardViolations.length > 0` — unchanged, but now HARD contract/rotation actually populate that array.
- **Invariants preserved** (`epics-context/epic-11-context.md` § 3): net-minute accounting (invariant #4 — *"this is exactly what 11-8 unifies"*); generation determinism (invariant #3 — tiebreakers `score → #shifts → #weekends → employeeId`, no RNG); multi-tenancy (every query filtered by `clinicId` from `ctx.user`).
- **`ruleType` is the single severity switch.** `PLANNING_RULE_TYPES = ['HARD','SOFT']`; category is one of `PLANNING_RULE_CATEGORIES`. HARD → `severity: 'blocking'`, SOFT → `severity: 'warning'`.

### File decisions (one responsibility each)
- **`apps/api/src/modules/planning/rule-engine.ts`** (CREATE) — *Responsibility:* pure evaluation of CONTRACT_COMPLIANCE + ROTATION_EQUITY rules (post-hoc and incremental), honoring `ruleType`/`breakMinutes`/`maxWeeklyHours`. *Imports:* nothing. *Exports:* `netMinutes`, `isoWeekStart`, `isoWeekday`, `evaluateContractCompliance`, `evaluateRotationEquity`, `violatesHardContractIncremental`, `violatesHardRotation`, and types `RuleType`/`EvaluatorRule`/`EvalShift`/`RuleViolation`.
- **`apps/api/src/modules/planning/rule-engine.spec.ts`** (CREATE) — *Responsibility:* isolated unit tests for every export. *Imports:* `./rule-engine`. *Exports:* none (Jest spec).
- **`apps/api/src/modules/planning/planning.service.ts`** (MODIFY) — *Responsibility:* post-hoc validation delegates contract/rotation decisions to the engine, routes HARD/SOFT, preserves `equityContext`. *Imports (added):* `netMinutes`, `evaluateContractCompliance`, `evaluateRotationEquity`, types from `./rule-engine`. *Exports:* unchanged public surface.
- **`apps/api/src/modules/planning/planning-generation.service.ts`** (MODIFY) — *Responsibility:* `scoreAndAssign` + `preValidateMove` delegate their HARD contract/rotation *decision* to the engine while keeping orchestration. *Imports (added):* `violatesHardContractIncremental`, `violatesHardRotation` from `./rule-engine`. *Exports:* unchanged.
- **`apps/web/src/i18n/langs/{fr,en}.json`** (MODIFY) — *Responsibility:* localize the new `weeklyOvertime` violation key. *Imports/Exports:* n/a.
- **Spec files** (`planning.service.spec.ts`, `planning-generation.service.spec.ts`) (MODIFY) — update assertions that assumed contract/rotation were soft-only; add HARD-surfacing + publish-blocking coverage.

### Step-0 quotes — current state at write time (re-verify the symbol; line numbers drift)

**`planning.service.ts` — the two evaluators to replace (current, defective):**
- `evaluateRotationEquity` (lines 405–513): signature `rule: { id; name; category }` (NO `ruleType`), receives only `softViolations`, always pushes `severity: 'warning'` (line 507). → replaced in Task 3(c).
- `evaluateContractCompliance` (lines 515–616): signature `rule: { id; name; category }` (NO `ruleType`), reads only `config.maxMonthlyHours` (line 526), `if (!maxMonthlyHours) return;` (line 528), sums minutes via `calculateShiftMinutes` (line 536, NO break), always `severity: 'warning'` (line 605). → replaced in Task 3(d).
- `calculateShiftMinutes` (lines 618–626): gross `end - start` with overnight wrap, no break param. Only caller is the old `evaluateContractCompliance`. → deleted in Task 3(e).
- Switch call-sites (lines 211–228): rotation + contract are passed only `softViolations`. → gains `hardViolations` in Task 3(b).
- Violation types `HardViolation` (36–46) / `SoftViolation` (48–59) already carry `messageKey?`/`messageParams?`; `SoftViolation` additionally carries `equityContext?`. `RuleViolation` from the engine is structurally compatible (minus `equityContext`).
- Loader (line 171): `include: { employee: { select } }` — **all Shift scalars (incl. `breakMinutes`) already returned**; only method types widen.

**`planning-generation.service.ts` — the decision points to delegate (current, already correct — delegation is for a single source of truth):**
- `scoreAndAssign` HARD contract loop (lines 1028–1048): computes `effectiveWeeklyLimit = ruleWeekly ? Math.min(emp.contractHours, ruleWeekly) : emp.contractHours`, `overtimeTol = 1 + overtimeThresholdPercent/100`, `projectedWeekMin = weekMin + slotMinutes` (net), returns `false` on breach; `minRest` block follows at 1050–1074 (**keep it**). → weekly+monthly delegated in Task 5(b).
- `violatesHardRotationEquity` (lines 3453–3505): `applicableJobTypes` short-circuit at 3461–3470, counts targetDay shifts, `return count >= maxPerPeriod` at 3504. → final return delegated in Task 5(c).
- `preValidateMove` CONTRACT loop (lines 2611–2632): `effectiveLimit = maxWeekly ? Math.min(contractHours, maxWeekly) : contractHours`, `overtimeTol` HARD-only, `bucket = rule.ruleType === 'HARD' ? hard : soft`, single entry then `break`. → delegated in Task 6(a).
- `preValidateMove` ROTATION check (lines 2714–2720): `if (targetDayCount + 1 > maxPerPeriod)`, `bucket` by ruleType. → delegated in Task 6(b).
- `preValidateMove` output shape is `Array<{ rule: string; message: string }>` (terse) — **do not change it** (the drag UI depends on it).
- Constructor injects `PlanningService` (line 117) — `preValidateMove`/`publishPlan` already call `this.planningService.*`.
- `publishPlan` gate (lines 2792–2803): `const { hardViolations } = await this.planningService.validateShiftsAgainstRules(...)`; `if (hardViolations.length > 0) throw new ConflictException('... hard violation(s) remain ...')`. → **no code change**, proven by Task 7.

**Current cross-path divergence being closed (audit § 0 / § 4):**

| Concern | scoreAndAssign (gen) | preValidateMove (move) | validateShiftsAgainstRules (validate/publish) |
|---|---|---|---|
| breakMinutes deducted | ✅ | ✅ | ❌ (gross) → fixed |
| maxWeeklyHours enforced | ✅ | ✅ | ❌ (only monthly) → fixed |
| ruleType honored (contract/rotation) | ✅ (pre-split hard/soft) | ✅ (inline branch) | ❌ (always soft) → fixed |
| HARD contract/rotation blocks publish | n/a | n/a | ❌ → now ✅ |

### equityContext preservation
The pure engine returns violations WITHOUT `equityContext` (it is a validators type / display concern). The service adapters (Task 3) re-attach `equityContext` to SOFT violations, reusing `options.equityCounters` and re-deriving the clinic average from the loaded shifts — preserving the Health Bar trend badge (stories 7-2 / 7-4). New weekly-contract violations reuse the `OVERTIME_HOURS` counter context.

### Testing
- **API** — Jest, `*.spec.ts` under `apps/api/src`, run filtered from repo root: `pnpm --filter @pawly/api test -- <pattern>`. The new module is tested in isolation (`rule-engine.spec.ts`); the three paths are covered in their existing service specs.
- **Web** — Vitest; only i18n JSON + a `tsc --noEmit` gate here.
- **Never `cd` into apps/packages**; all commands from repo root (`CLAUDE.md`). Root `pnpm test` is broken by the rtk shim (project memory) — always `--filter`.
- **L-audit applied:** the fix is verified on ALL three entry-points (Tasks 4/5/6) plus the publish gate (Task 7), not just one — the exact failure mode the 7-6 guard hit.

### Dependencies & lessons
- No new npm dependencies. Pure TS + existing Prisma/Zod.
- **L4** (Context7 for SDKs): no third-party SDK surface here; the module is dependency-free.
- **L5** (SWC emits no `.d.ts`): avoided by keeping the module in-app (no cross-package type export). If later promoted to `@pawly/planning-rules`, add the `tsc` build + a jest `moduleNameMapper` entry (see Scope decisions).
- **Commit prefix:** `feat(KON-125): …` for behaviour, `test(KON-125): …` for test-only commits, `refactor(KON-125): …` if a commit is pure restructuring. Stage specific files — never `git add .`.

## File List
- `apps/api/src/modules/planning/rule-engine.ts` — CREATE (pure unified evaluator)
- `apps/api/src/modules/planning/rule-engine.spec.ts` — CREATE (isolated unit tests)
- `apps/api/src/modules/planning/planning.service.ts` — MODIFY (validation delegates + routes HARD/SOFT, deletes `calculateShiftMinutes`)
- `apps/api/src/modules/planning/planning.service.spec.ts` — MODIFY (HARD-surfacing coverage + updated assertions)
- `apps/api/src/modules/planning/planning-generation.service.ts` — MODIFY (`scoreAndAssign` + `preValidateMove` delegate)
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — MODIFY (delegation + publish-block coverage)
- `apps/web/src/i18n/langs/fr.json` — MODIFY (weeklyOvertime key)
- `apps/web/src/i18n/langs/en.json` — MODIFY (weeklyOvertime key)

## Dev Agent Record

- **Model:** claude-fable-5
- **Started:** 2026-07-12
- **Completed:** 2026-07-12

### Summary

Unified rule engine shipped exactly per spec. The pure module `rule-engine.ts` (no
NestJS/Prisma/I/O, sibling of `french-labor-law.ts`) is now the single decision point for
CONTRACT_COMPLIANCE + ROTATION_EQUITY on all three write paths: `validateShiftsAgainstRules`
delegates through HARD/SOFT-routing adapters that preserve `equityContext` (the security fix —
`ruleType` honoured, `maxWeeklyHours` enforced ISO-week-bucketed, minutes net of
`breakMinutes`); `scoreAndAssign` and `preValidateMove` delegate their weekly/monthly and
rotation cap decisions to the same incremental primitives with orchestration, tiebreakers and
O(1) counters untouched. A HARD contract/rotation breach now lands in `hardViolations` and
blocks publication (409) — proven by unit test and live.

### Files changed

- `apps/api/src/modules/planning/rule-engine.ts` — **new**: pure unified evaluator (post-hoc
  + incremental primitives, `netMinutes`/`isoWeekStart`/`isoWeekday`).
- `apps/api/src/modules/planning/rule-engine.spec.ts` — **new**: 15 isolated unit tests
  (passing/breaching/boundary per primitive).
- `apps/api/src/modules/planning/planning.service.ts` — contract/rotation evaluators replaced
  by delegating adapters (+`computeRotationClinicAverage`/`computeClinicAverageHours` helpers);
  switch arms pass `hardViolations`; `calculateShiftMinutes` deleted.
- `apps/api/src/modules/planning/planning.service.spec.ts` — +4 tests
  (`validateShiftsAgainstRules — unified engine`).
- `apps/api/src/modules/planning/planning-generation.service.ts` — `scoreAndAssign` weekly+
  monthly HARD caps via `violatesHardContractIncremental`; `violatesHardRotationEquity` final
  decision via `violatesHardRotation`; `preValidateMove` contract loop + rotation check
  delegated (weekly-only semantics kept via stripped `maxMonthlyHours`).
- `apps/api/src/modules/planning/planning-generation.service.spec.ts` — +2 determinism tests,
  +2 preValidateMove HARD/SOFT tests, +1 publish-blocked-by-HARD-contract test.
- `apps/web/src/i18n/langs/fr.json` / `en.json` — `weeklyOvertime` key added.

### Deviations

- **Task 4 fixtures (Mon-Sat → Mon-Fri).** The story's sketched fixtures (6 days Mon-Sat)
  trip the always-on 11-3 statutory weekly-rest check (≥35h/ISO week — max rest was 30h),
  contaminating `hardViolations` with statutory CONTRACT_COMPLIANCE entries and making the
  HARD-weekly assertion pass/fail for the wrong reason. Fixtures use Mon-Fri (5×9h = 45h,
  statutory-quiet); the SOFT-monthly case uses 08:00-17:00 to stay off the 10h/day boundary.
- **Task 4 "flip existing soft-only assertions": none existed.** Recon of
  `planning.service.spec.ts` found every configured contract/rotation rule in existing tests
  is SOFT — the HARD-surfacing cases are net-new; zero existing assertions were flipped.
- **Task 8 extended to a second i18n location.** `weeklyOvertime` was added under BOTH
  `admin.planningRules.healthBar.violations.contractCompliance` (HealthBarDetailPopover) AND
  `admin.violations.contractCompliance` (ConflictIndicator/WarningBadge grid badges) in fr+en —
  the story listed only the first, but the grid badge resolves the same `messageKey` under the
  second namespace (verified live: both render the fr message).
- **TDD ordering per the Iron Law**: Task 2's spec was written before Task 1's module (RED:
  `Cannot find module './rule-engine'`); Tasks 5/6 are pure delegations of already-correct
  paths, so their preservation tests were validated by mutation (delegation inverted → RED
  witnessed → restored) rather than a first-run failure. Commits still match the story's plan
  (one per task).
- **Env gotchas (worktree)**: Prisma client + `@pawly/*` dist + API `tsc -p
  tsconfig.types.json` had to be generated/built fresh in this worktree before typechecks
  passed (known L5/epic11 gotchas); jest pattern `rule-engine` matches the worktree PATH —
  used `--testPathPatterns "rule-engine\.spec"`.

### Test output

- `pnpm --filter @pawly/api test -- --testPathPatterns "rule-engine\.spec|planning\.service\.spec|planning-generation\.service\.spec"`
  → **Test Suites: 3 passed / Tests: 222 passed, 222 total**, exit 0 (rule-engine 15,
  planning.service 39 incl. 4 new, planning-generation 168 incl. 5 new).
- Full sweeps: API `pnpm --filter @pawly/api test` → **954/954** (35 suites); web
  `pnpm --filter @pawly/web test` → **756/756** (51 files); `tsc --noEmit` web exit 0 after
  `@pawly/api build` (L5 types pass exit 0); API tsc: **0 errors in story files** (24 residual
  errors = pre-existing spec-fixture noise in clinic/employee/variance/planning.service specs,
  documented since 11-5).
- **Live verification (headed Chrome, web:3020/API:3001, Clinique test, July 2026):** HARD
  `CONTRACT_COMPLIANCE { maxWeeklyHours: 20 }` rule created via Settings→Planning Rules UI;
  seeded veto 4×7h net (28h) + fredy 2×7h. Health Bar → **"1 conflit … 83% prêt"**, popover
  **"Conformité contrat (1) — veto veo — 28h la semaine du 2026-07-13, dépasse la limite
  hebdomadaire de 20h"** (new `weeklyOvertime` key, fr), **Publier disabled** ("Publication
  impossible — résolvez les conflits d'abord"); grid badge "Conflit (1)" renders the same
  message (second i18n namespace). Keyboard drag (dnd-kit) veto→fredy Thursday: **drop
  refused** — "Dépôt impossible ici — Overtime risk: 21h this week, effective limit 20h" —
  the same shared-engine verdict on the move path. React Grab `get_element_context` confirmed
  the Health Bar `PopoverContent` (components/ui/popover.tsx:27) mounted in the Radix tree.
  Console: no runtime errors (only pre-existing dev CSP noise). Test data fully cleaned up
  (6 shifts deleted, rule deleted via UI, seed admin repointed to Zen Dev, Upstash user-cache
  key purged).

