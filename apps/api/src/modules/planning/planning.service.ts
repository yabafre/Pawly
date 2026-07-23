import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import type { Prisma } from '@prisma/client';
import type {
  CreatePlanningRuleInput,
  UpdatePlanningRuleInput,
  ListPlanningRulesInput,
  TogglePlanningRuleInput,
  ValidateShiftsInput,
  StaffingMinimumConfig,
  SkillRequirementConfig,
  PlanningRuleCategory,
} from '@pawly/validators';
import {
  staffingMinimumConfigSchema,
  rotationEquityConfigSchema,
  skillRequirementConfigSchema,
  contractComplianceConfigSchema,
} from '@pawly/validators';
import type { EquityContext } from '@pawly/validators';
import type { CounterWithEmployee } from './equity-counter.service';
import {
  findStatutoryViolations,
  isoWeekStart,
  regimeForJobType,
  STATUTORY_RULE_CONFIG,
  STATUTORY_RULE_NAME,
  STATUTORY_WINDOW_DAYS,
  type StatutoryShift,
  type StatutoryViolation,
  type StatutoryViolationKind,
} from './french-labor-law';
import {
  netMinutes,
  evaluateContractCompliance as engineEvaluateContractCompliance,
  evaluateRotationEquity as engineEvaluateRotationEquity,
  type EvalShift,
  type RuleType,
} from './rule-engine';

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

type SoftViolation = {
  ruleId: string;
  ruleName: string;
  category: PlanningRuleCategory;
  message: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  affectedEmployeeId?: string;
  affectedDate?: string;
  severity: 'warning';
  equityContext?: EquityContext;
};

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicService: ClinicService,
  ) {}

  async createRule(clinicId: string, input: CreatePlanningRuleInput) {
    await this.validateConfig(clinicId, input.category, input.config);

    return this.prisma.planningRule.create({
      data: {
        clinicId,
        name: input.name,
        description: input.description || null,
        ruleType: input.ruleType,
        category: input.category,
        isActive: input.isActive,
        config: input.config as Prisma.InputJsonValue,
        priority: input.priority,
      },
    });
  }

  async updateRule(clinicId: string, input: UpdatePlanningRuleInput) {
    const { id, ...updateData } = input;
    await this.findRuleById(clinicId, id);
    await this.validateConfig(clinicId, updateData.category, updateData.config);

    return this.prisma.planningRule.update({
      where: { id },
      data: {
        name: updateData.name,
        description: updateData.description || null,
        ruleType: updateData.ruleType,
        category: updateData.category,
        isActive: updateData.isActive,
        config: updateData.config as Prisma.InputJsonValue,
        priority: updateData.priority,
      },
    });
  }

  async deleteRule(clinicId: string, ruleId: string) {
    const { count } = await this.prisma.planningRule.deleteMany({
      where: { id: ruleId, clinicId },
    });

    if (count === 0) {
      throw new NotFoundException(`Planning rule ${ruleId} not found`);
    }

    return { id: ruleId };
  }

  async listRules(clinicId: string, filters?: ListPlanningRulesInput) {
    const rules = await this.prisma.planningRule.findMany({
      where: {
        clinicId,
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.ruleType ? { ruleType: filters.ruleType } : {}),
        ...(filters?.isActive !== undefined
          ? { isActive: filters.isActive }
          : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    // KON-140 (V8) — the seeded statutory showcase row is display-only, but clinics
    // seeded before KON-139 still carry the old limits in DB (maxDailyHours: 10 while
    // the engine enforces 12). Normalize AT READ from the code constants so the display
    // is always truthful — no data migration, and admin edits to the showcase cannot
    // desync it either.
    return rules.map((r) =>
      r.name === STATUTORY_RULE_NAME
        ? { ...r, config: { ...STATUTORY_RULE_CONFIG } }
        : r,
    );
  }

  async getRuleById(clinicId: string, ruleId: string) {
    return this.findRuleById(clinicId, ruleId);
  }

  async toggleRule(clinicId: string, input: TogglePlanningRuleInput) {
    await this.findRuleById(clinicId, input.id);

    return this.prisma.planningRule.update({
      where: { id: input.id },
      data: { isActive: input.isActive },
    });
  }

  async validateShiftsAgainstRules(
    clinicId: string,
    input: ValidateShiftsInput,
    options?: { equityCounters?: CounterWithEmployee[] },
  ): Promise<{
    hardViolations: HardViolation[];
    softViolations: SoftViolation[];
    rules: Array<{
      id: string;
      name: string;
      category: string;
      ruleType: string;
      config: unknown;
      priority: number;
    }>;
  }> {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    // Load active planning rules for this clinic, ordered by priority DESC
    const rules = await this.prisma.planningRule.findMany({
      where: { clinicId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    // Load shifts in the date range with employee data
    const shifts = await this.prisma.shift.findMany({
      where: {
        clinicId,
        date: { gte: startDate, lte: endDate },
      },
      include: {
        employee: {
          select: { id: true, jobType: true, contractHours: true },
        },
      },
    });

    // Filter out shifts without shiftTypeCode (pre-migration data safety)
    const validShifts = shifts.filter((s) => s.shiftTypeCode);

    const hardViolations: HardViolation[] = [];
    const softViolations: SoftViolation[] = [];

    for (const rule of rules) {
      const config = rule.config as Record<string, unknown>;

      switch (rule.category) {
        case 'STAFFING_MINIMUM':
          this.evaluateStaffingMinimum(
            rule,
            config,
            validShifts,
            hardViolations,
            softViolations,
          );
          break;
        case 'SKILL_REQUIREMENT':
          this.evaluateSkillRequirement(
            rule,
            config,
            validShifts,
            hardViolations,
            softViolations,
          );
          break;
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
      }
    }

    // Story 13-2 (KON-134) — statutory checks (35h weekly rest, consecutive days) span
    // month frontiers, so they run on a +/-14-real-day window around [startDate, endDate]
    // (STATUTORY_WINDOW_DAYS — KON-139 widened it for the CCN rest-days rule), NOT the
    // strict month `validShifts` uses. Only breaches attributable to the published range
    // are reported (a breach living purely in an adjacent month must not block this
    // month's publish).
    const statWindowStart = new Date(startDate);
    statWindowStart.setUTCDate(statWindowStart.getUTCDate() - STATUTORY_WINDOW_DAYS);
    const statWindowEnd = new Date(endDate);
    statWindowEnd.setUTCDate(statWindowEnd.getUTCDate() + STATUTORY_WINDOW_DAYS);
    const statutoryShifts = await this.prisma.shift.findMany({
      where: { clinicId, date: { gte: statWindowStart, lte: statWindowEnd } },
      include: { employee: { select: { id: true, jobType: true } } },
    });
    const toIso = (d: Date) => d.toISOString().split('T')[0];

    // KON-139 — CCN 44h/12-week average: authoritative weekly history for every ISO week
    // strictly before the range's first Monday (11 weeks back), per employee. Weeks in the
    // history map override the (possibly partial) +/-14-day shift rows.
    const rangeMonday = isoWeekStart(toIso(startDate));
    const historyStart = new Date(`${rangeMonday}T00:00:00.000Z`);
    historyStart.setUTCDate(historyStart.getUTCDate() - 77);
    const historyEnd = new Date(`${rangeMonday}T00:00:00.000Z`);
    historyEnd.setUTCDate(historyEnd.getUTCDate() - 1);
    const historyShifts = await this.prisma.shift.findMany({
      where: { clinicId, date: { gte: historyStart, lte: historyEnd } },
      select: {
        employeeId: true,
        date: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
      },
    });
    const weeklyHistory = new Map<string, Map<string, number>>();
    for (const s of historyShifts) {
      const monday = isoWeekStart(s.date.toISOString().split('T')[0]);
      const perWeek = weeklyHistory.get(s.employeeId) ?? new Map();
      perWeek.set(
        monday,
        (perWeek.get(monday) || 0) +
          netMinutes(s.startTime, s.endTime, s.breakMinutes),
      );
      weeklyHistory.set(s.employeeId, perWeek);
    }

    this.evaluateStatutoryLimits(
      statutoryShifts.filter((s) => s.shiftTypeCode),
      hardViolations,
      softViolations,
      { start: toIso(startDate), end: toIso(endDate) },
      { start: toIso(statWindowStart), end: toIso(statWindowEnd) },
      weeklyHistory,
    );

    return { hardViolations, softViolations, rules };
  }

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
    VACATIONS_COUNT: 'violations.statutory.vacationsCount',
    VACATION_MIN_DURATION: 'violations.statutory.vacationMinDuration',
    REST_DAYS_WINDOW: 'violations.statutory.restDaysWindow',
    REST_DAYS_SUNDAY: 'violations.statutory.restDaysSunday',
    TWELVE_WEEK_AVG: 'violations.statutory.twelveWeekAvg',
  };

  private evaluateStatutoryLimits(
    shifts: Array<{
      date: Date;
      startTime: string;
      endTime: string;
      breakMinutes: number;
      employee: { id: string; jobType: string };
    }>,
    hardViolations: HardViolation[],
    softViolations: SoftViolation[],
    reportRange: { start: string; end: string },
    window: { start: string; end: string },
    weeklyHistory?: Map<string, Map<string, number>>,
  ) {
    const byEmployee = new Map<string, StatutoryShift[]>();
    const jobTypeByEmployee = new Map<string, string>();
    for (const s of shifts) {
      const arr = byEmployee.get(s.employee.id) ?? [];
      arr.push({
        date: s.date.toISOString().split('T')[0],
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
      });
      byEmployee.set(s.employee.id, arr);
      jobTypeByEmployee.set(s.employee.id, s.employee.jobType);
    }

    for (const [employeeId, empShifts] of byEmployee) {
      const violations = findStatutoryViolations(empShifts, {
        regime: regimeForJobType(jobTypeByEmployee.get(employeeId)),
        window,
        weeklyHistory: weeklyHistory?.get(employeeId),
      });
      for (const v of violations) {
        if (!PlanningService.violationInPublishedRange(v, reportRange))
          continue;
        if (v.soft) {
          // KON-139 — REST_DAYS_SUNDAY on practitioners (« de préférence un dimanche »):
          // surfaced as a warning, never blocking.
          const h = this.statutoryToHardViolation(v, employeeId);
          softViolations.push({ ...h, severity: 'warning' });
        } else {
          hardViolations.push(this.statutoryToHardViolation(v, employeeId));
        }
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
    if (
      v.kind === 'WEEKLY_REST' ||
      v.kind === 'WEEKLY_CEILING' ||
      v.kind === 'TWELVE_WEEK_AVG'
    ) {
      const d = new Date(`${v.date}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 6);
      const weekEnd = d.toISOString().split('T')[0];
      return v.date <= range.end && weekEnd >= range.start;
    }
    return v.date >= range.start && v.date <= range.end;
  }

  /** ISO `YYYY-MM-DD` → French `DD/MM/YYYY` for human-facing statutory messages. */
  private static formatFrDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
  }

  private statutoryToHardViolation(
    v: StatutoryViolation,
    employeeId: string,
  ): HardViolation {
    const MINUTE_KINDS: ReadonlySet<StatutoryViolationKind> = new Set([
      'DAILY_WORK',
      'DAILY_AMPLITUDE',
      'DAILY_REST',
      'WEEKLY_CEILING',
      'VACATION_MIN_DURATION',
      'TWELVE_WEEK_AVG',
    ]);
    const inMinutes = MINUTE_KINDS.has(v.kind);
    const actual = inMinutes ? Math.round((v.actual / 60) * 10) / 10 : v.actual;
    const limit = inMinutes ? v.limit / 60 : v.limit;
    // Human-facing date is French-formatted; `affectedDate` stays ISO because it
    // keys the grid-cell conflict lookup (`${employeeId}|${day.date}`).
    const displayDate = PlanningService.formatFrDate(v.date);
    // KON-140 — deficit kinds measure a value UNDER a minimum; the fallback comparator
    // must read the right way ('(0 > 20)' for a missing break was nonsense).
    const DEFICIT_KINDS: ReadonlySet<StatutoryViolationKind> = new Set([
      'DAILY_REST',
      'WEEKLY_REST',
      'MANDATORY_BREAK',
      'REST_DAYS_WINDOW',
      'REST_DAYS_SUNDAY',
      'VACATION_MIN_DURATION',
    ]);
    const cmp = DEFICIT_KINDS.has(v.kind) ? '<' : '>';
    return {
      ruleId: `statutory:${v.kind.toLowerCase()}`,
      ruleName: STATUTORY_RULE_NAME,
      category: 'CONTRACT_COMPLIANCE',
      message: `Statutory ${v.kind} limit breached on ${displayDate} (${actual} ${cmp} ${limit})`,
      messageKey: PlanningService.STATUTORY_MESSAGE_KEY[v.kind],
      messageParams: { date: displayDate, actual, limit },
      affectedEmployeeId: employeeId,
      affectedDate: v.date,
      severity: 'blocking',
    };
  }

  private evaluateStaffingMinimum(
    rule: { id: string; name: string; category: string; ruleType: string },
    config: Record<string, unknown>,
    shifts: Array<{
      date: Date;
      shiftTypeCode: string;
      employee: { id: string; jobType: string };
    }>,
    hardViolations: HardViolation[],
    softViolations: SoftViolation[],
  ) {
    const shiftTypeCode = config.shiftTypeCode as string;
    const minStaff = config.minStaff as number;
    const jobTypes = config.jobTypes as string[] | undefined;

    // Group shifts by date
    const shiftsByDate = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      if (shift.shiftTypeCode !== shiftTypeCode) continue;
      const dateKey = shift.date.toISOString().split('T')[0];
      const group = shiftsByDate.get(dateKey) || [];
      group.push(shift);
      shiftsByDate.set(dateKey, group);
    }

    for (const [dateKey, dateShifts] of shiftsByDate) {
      const matchingShifts = jobTypes
        ? dateShifts.filter((s) => jobTypes.includes(s.employee.jobType))
        : dateShifts;

      if (matchingShifts.length < minStaff) {
        const violation = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category as PlanningRuleCategory,
          message: `Only ${matchingShifts.length} staff assigned for ${shiftTypeCode} on ${dateKey}, minimum ${minStaff} required`,
          affectedDate: dateKey,
        };

        if (rule.ruleType === 'HARD') {
          hardViolations.push({ ...violation, severity: 'blocking' as const });
        } else {
          softViolations.push({ ...violation, severity: 'warning' as const });
        }
      }
    }
  }

  private evaluateSkillRequirement(
    rule: { id: string; name: string; category: string; ruleType: string },
    config: Record<string, unknown>,
    shifts: Array<{
      date: Date;
      shiftTypeCode: string;
      employee: { id: string; jobType: string };
    }>,
    hardViolations: HardViolation[],
    softViolations: SoftViolation[],
  ) {
    const shiftTypeCode = config.shiftTypeCode as string;
    const requiredJobTypes = config.requiredJobTypes as string[];

    // Group shifts by date
    const shiftsByDate = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      if (shift.shiftTypeCode !== shiftTypeCode) continue;
      const dateKey = shift.date.toISOString().split('T')[0];
      const group = shiftsByDate.get(dateKey) || [];
      group.push(shift);
      shiftsByDate.set(dateKey, group);
    }

    for (const [dateKey, dateShifts] of shiftsByDate) {
      const assignedJobTypes = new Set(
        dateShifts.map((s) => s.employee.jobType),
      );
      const missingTypes = requiredJobTypes.filter(
        (jt) => !assignedJobTypes.has(jt),
      );

      if (missingTypes.length > 0) {
        const violation = {
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category as PlanningRuleCategory,
          message: `Missing required job type(s) ${missingTypes.join(', ')} for ${shiftTypeCode} on ${dateKey}`,
          affectedDate: dateKey,
        };

        if (rule.ruleType === 'HARD') {
          hardViolations.push({ ...violation, severity: 'blocking' as const });
        } else {
          softViolations.push({ ...violation, severity: 'warning' as const });
        }
      }
    }
  }

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
      targetDay === 'saturday'
        ? 'SATURDAY_WORKED'
        : `${targetDay.toUpperCase()}_SHIFTS`;
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
    const counterType =
      targetDay === 'saturday' ? 'SATURDAY_WORKED' : undefined;
    if (equityCounters && counterType) {
      // Legacy fallback preserved exactly: counters supplied but none matching
      // -> average 0, never the shift-data average (aped-review m5).
      const relevant = equityCounters.filter(
        (c) => c.counterType === counterType,
      );
      return relevant.length > 0
        ? relevant.reduce((sum, c) => sum + c.count, 0) / relevant.length
        : 0;
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
      countByEmployee.set(
        s.employeeId,
        (countByEmployee.get(s.employeeId) || 0) + 1,
      );
    }
    const counts = Array.from(countByEmployee.values());
    return counts.length > 0
      ? counts.reduce((a, b) => a + b, 0) / counts.length
      : 0;
  }

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

    const clinicAverageHours = this.computeClinicAverageHours(
      evalShifts,
      equityCounters,
    );

    for (const v of results) {
      if (v.severity === 'blocking') {
        hardViolations.push({
          ...v,
          category: v.category as PlanningRuleCategory,
          severity: 'blocking' as const,
        });
      } else if (
        v.messageKey === 'violations.contractCompliance.weeklyOvertime'
      ) {
        // A weekly figure against the monthly clinic average is meaningless as
        // a trend — the weekly bucket carries no equityContext (aped-review m4).
        softViolations.push({
          ...v,
          category: v.category as PlanningRuleCategory,
          severity: 'warning' as const,
        });
      } else {
        const currentHours = Number(v.messageParams?.currentMonthlyHours ?? 0);
        const maxHours = Number(v.messageParams?.maxMonthlyHours ?? 0);
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
    const perEmployeeHours = Array.from(minutesByEmployee.values()).map(
      (m) => m / 60,
    );
    const currentAvg =
      perEmployeeHours.length > 0
        ? perEmployeeHours.reduce((a, b) => a + b, 0) / perEmployeeHours.length
        : 0;
    if (equityCounters) {
      const overtime = equityCounters.filter(
        (c) => c.counterType === 'OVERTIME_HOURS',
      );
      if (overtime.length > 0) {
        const avgHist =
          overtime.reduce((sum, c) => sum + c.count, 0) / overtime.length / 60;
        return currentAvg + avgHist;
      }
    }
    return currentAvg;
  }

  private async findRuleById(clinicId: string, ruleId: string) {
    const rule = await this.prisma.planningRule.findFirst({
      where: { id: ruleId, clinicId },
    });

    if (!rule) {
      throw new NotFoundException(`Planning rule ${ruleId} not found`);
    }

    return rule;
  }

  private async validateConfig(
    clinicId: string,
    category: string,
    config: unknown,
  ) {
    // Validate config shape matches the category
    switch (category) {
      case 'STAFFING_MINIMUM': {
        const parsed = staffingMinimumConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new BadRequestException(
            `Invalid staffing minimum config: ${parsed.error.message}`,
          );
        }
        await this.validateShiftTypeCode(
          clinicId,
          (parsed.data as StaffingMinimumConfig).shiftTypeCode,
        );
        break;
      }
      case 'ROTATION_EQUITY': {
        const parsed = rotationEquityConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new BadRequestException(
            `Invalid rotation equity config: ${parsed.error.message}`,
          );
        }
        break;
      }
      case 'SKILL_REQUIREMENT': {
        const parsed = skillRequirementConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new BadRequestException(
            `Invalid skill requirement config: ${parsed.error.message}`,
          );
        }
        await this.validateShiftTypeCode(
          clinicId,
          (parsed.data as SkillRequirementConfig).shiftTypeCode,
        );
        break;
      }
      case 'CONTRACT_COMPLIANCE': {
        const parsed = contractComplianceConfigSchema.safeParse(config);
        if (!parsed.success) {
          throw new BadRequestException(
            `Invalid contract compliance config: ${parsed.error.message}`,
          );
        }
        break;
      }
      default:
        throw new BadRequestException(`Unknown rule category: ${category}`);
    }
  }

  private async validateShiftTypeCode(clinicId: string, shiftTypeCode: string) {
    const shiftTypes = await this.clinicService.listShiftTypes(clinicId);
    const exists = shiftTypes.some((st) => st.code === shiftTypeCode);

    if (!exists) {
      throw new BadRequestException(
        `Shift type code "${shiftTypeCode}" does not exist for this clinic`,
      );
    }
  }
}
