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

function severityFor(ruleType: RuleType): 'blocking' | 'warning' {
  return ruleType === 'HARD' ? 'blocking' : 'warning';
}

/**
 * ISO 'YYYY-MM-DD' -> French 'DD/MM/YYYY' for human-facing message params — mirrors
 * PlanningService.formatFrDate on the statutory messages. `affectedDate` stays ISO
 * because it keys the grid-cell conflict lookup.
 */
function formatFrDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Overtime tolerance multiplier: HARD rules honour overtimeThresholdPercent; SOFT = 1. */
function toleranceFor(rule: EvaluatorRule): number {
  return rule.ruleType === 'HARD'
    ? 1 + ((rule.config.overtimeThresholdPercent as number) || 0) / 100
    : 1;
}

/**
 * POST-HOC contract-compliance evaluation over a set of shifts (validateShiftsAgainstRules).
 * Emits one violation per (employee, breached ISO week) and one per employee for
 * maxMonthlyHours. Severity follows ruleType. Worked minutes are NET of breakMinutes.
 * Effective weekly limit = min(contractHours, maxWeeklyHours), falling back to contractHours
 * when the rule sets no weekly cap — symmetric with violatesHardContractIncremental, so a
 * roster the generator or a move would refuse can no longer validate green. Monthly limit =
 * maxMonthlyHours, only when configured. Both scaled by the HARD overtime tolerance
 * (SOFT tolerance = 1).
 */
export function evaluateContractCompliance(
  rule: EvaluatorRule,
  shifts: EvalShift[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const maxWeekly = rule.config.maxWeeklyHours as number | undefined;
  const maxMonthly = rule.config.maxMonthlyHours as number | undefined;

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

    const effectiveLimit =
      maxWeekly !== undefined
        ? Math.min(contractHours, maxWeekly)
        : contractHours;
    const weekMinutes = new Map<string, number>();
    for (const s of empShifts) {
      const wk = isoWeekStart(s.date);
      weekMinutes.set(
        wk,
        (weekMinutes.get(wk) || 0) +
          netMinutes(s.startTime, s.endTime, s.breakMinutes),
      );
    }
    for (const [wk, mins] of weekMinutes) {
      if (mins > effectiveLimit * 60 * tol) {
        const hours = Math.round((mins / 60) * 10) / 10;
        const displayDate = formatFrDate(wk);
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          message: `Employee worked ${hours}h in week of ${displayDate}, exceeds weekly limit ${effectiveLimit}h`,
          messageKey: 'violations.contractCompliance.weeklyOvertime',
          messageParams: {
            currentWeeklyHours: hours,
            maxWeeklyHours: effectiveLimit,
            date: displayDate,
          },
          affectedEmployeeId: employeeId,
          affectedDate: wk,
          severity,
        });
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
          messageParams: {
            currentMonthlyHours: hours,
            maxMonthlyHours: maxMonthly,
          },
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
  const applicableJobTypes = rule.config.applicableJobTypes as
    | string[]
    | undefined;
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
          messageParams: {
            currentCount: count,
            maxPerPeriod,
            targetDay,
            trackingPeriod,
          },
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
  if (args.weekMinutes + args.candidateMinutes > effectiveWeekly * 60 * tol)
    return true;

  const maxMonthly = rule.config.maxMonthlyHours as number | undefined;
  if (
    maxMonthly &&
    args.monthMinutes + args.candidateMinutes > maxMonthly * 60 * tol
  ) {
    return true;
  }
  return false;
}

/**
 * INCREMENTAL HARD rotation check (scoreAndAssign + preValidateMove). `currentCount` = the
 * employee's existing targetDay shifts in the tracking period. Returns true when the cap is
 * already reached (adding one more would exceed it — `count >= maxPerPeriod`, equivalent to
 * the historic `count + 1 > maxPerPeriod`). Respects applicableJobTypes.
 *
 * Both current call sites pre-filter applicableJobTypes before counting — preValidateMove
 * must, to skip the lazy quarterly shift load for non-applicable rules. The guard here is
 * deliberate defense-in-depth for future callers, not an oversight.
 */
export function violatesHardRotation(
  rule: EvaluatorRule,
  args: { currentCount: number; jobType: string },
): boolean {
  const applicableJobTypes = rule.config.applicableJobTypes as
    | string[]
    | undefined;
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
