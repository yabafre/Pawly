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
import {
  regimeForJobType,
  wouldExceedStatutory,
  type StatutoryShift,
} from './french-labor-law';
import { shiftsOverlap } from './shift-interval';
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
  /**
   * Story 13-3 (KON-132) — target employee's shifts across the target date AND its
   * immediate neighbours (D-1/D/D+1), excluding the moved shift. The window spans
   * adjacent days so the wrap-aware overlap check sees a shift crossing midnight.
   */
  overlapWindowShifts: MoveEvalShift[];
  /** Target employee's shifts in the target ISO week, excluding the moved shift. */
  weekShifts: MoveEvalShift[];
  /** Target employee's shifts in the target MONTH, excluding the moved shift (rotation pool). */
  monthShifts: MoveEvalShift[];
  /** Quarter-but-not-month shifts, excluding the moved shift. Empty unless a quarterly rotation rule exists. */
  quarterExtraShifts: MoveEvalShift[];
  /** Target employee's shifts in the +/-14 real-day statutory window (STATUTORY_WINDOW_DAYS), excluding the moved shift. */
  statutoryWindowShifts: MoveEvalShift[];
  /** KON-139 — CCN 44h/12-week average: net minutes per ISO Monday around the target week, moved shift excluded. */
  twelveWeek: {
    totalsByMonday: Map<string, number>;
    lastWeekMonday: string;
  };
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

  // Time overlap on the target employee — Story 13-3 (KON-132): wrap-aware across
  // the D-1/D/D+1 window, so a shift crossing midnight on an adjacent day is caught.
  for (const existing of ctx.overlapWindowShifts) {
    if (
      shiftsOverlap(
        {
          date: targetDate,
          startTime: ctx.shift.startTime,
          endTime: ctx.shift.endTime,
        },
        {
          date: existing.date,
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

  const toNetMinutes = (s: MoveEvalShift): number => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    const raw = eh * 60 + em - (sh * 60 + sm);
    const span = raw < 0 ? raw + 1440 : raw;
    return Math.max(0, span - (s.breakMinutes || 0));
  };

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
          // KON-140 (V7) — target-day net minutes for a configured maxDailyHours.
          dayMinutes: ctx.monthShifts
            .filter((s) => s.date === targetDate)
            .reduce((sum, s) => sum + toNetMinutes(s), 0),
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

  // Statutory (Story 11-3) — non-disableable, evaluated on the +/-14 real-day window
  // (13-1 widened it from the strict month; KON-139 widened it again for the CCN
  // rest-days rule and made the regime + 44h/12-week context explicit).
  const breaches = wouldExceedStatutory(
    ctx.statutoryWindowShifts.map(toStatutoryShift),
    {
      date: targetDate,
      startTime: ctx.shift.startTime,
      endTime: ctx.shift.endTime,
      breakMinutes: ctx.shift.breakMinutes,
    },
    {
      regime: regimeForJobType(employee.jobType),
      twelveWeek: {
        totals: (isoMonday) => ctx.twelveWeek.totalsByMonday.get(isoMonday) ?? 0,
        lastWeekMonday: ctx.twelveWeek.lastWeekMonday,
      },
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
