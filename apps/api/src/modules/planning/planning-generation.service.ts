import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { EquityCounterService } from './equity-counter.service';
import { ApprenticeDeclarationService } from './apprentice-declaration.service';
import { templateDataSchema } from '@pawly/validators';
import type { TemplateData } from '@pawly/validators';
import type { GenerationResult } from '@pawly/validators';
import type {
  ScheduleViewData,
  ScheduleEmployee,
  ScheduleDayInfo,
  ScheduleShift,
  ScheduleUnavailability,
  ScheduleHole,
} from '@pawly/validators';

type SlotRequirement = {
  date: string;
  shiftTypeCode: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  requiredStaff: number;
  requiredJobTypes?: string[];
};

type EmployeeInfo = {
  id: string;
  firstName: string;
  lastName: string;
  jobType: string;
  contractHours: number;
};

type AssignedShift = {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftTypeCode: string;
  breakMinutes?: number;
};

type RuleEntry = {
  id: string;
  name: string;
  category: string;
  config: Record<string, unknown>;
  priority: number;
};

type ConstraintMap = {
  unavailableMap: Map<string, Set<string>>;
  schoolDayMap: Map<string, Set<string>>; // apprentice school dates (count toward weekly hours)
  hardRules: RuleEntry[];
  softRules: RuleEntry[];
  equityMap: Map<
    string,
    {
      saturdayCount: number;
      weekendCount: number;
      holidayCount: number;
      overtimeMinutes: number;
    }
  >;
  quarterlyShifts: AssignedShift[]; // historical shifts from other months in the same quarter
};

@Injectable()
export class PlanningGenerationService {
  private readonly logger = new Logger(PlanningGenerationService.name);
  private static readonly MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
  private static readonly SCHOOL_DAY_MINUTES = 420; // 7h standard school day in France
  private static readonly DAY_NAME_TO_ISO: Record<string, number> = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
    friday: 5, saturday: 6, sunday: 7,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicService: ClinicService,
    private readonly planningService: PlanningService,
    private readonly planningTemplateService: PlanningTemplateService,
    private readonly equityCounterService: EquityCounterService,
    private readonly apprenticeDeclarationService: ApprenticeDeclarationService,
  ) {}

  async generateMonthlyPlan(
    clinicId: string,
    month: string,
    templateId: string,
  ): Promise<GenerationResult> {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(`Invalid month format: ${month}. Expected YYYY-MM`);
    }

    const template = await this.planningTemplateService.getTemplateById(
      clinicId,
      templateId,
    );
    const parsed = templateDataSchema.safeParse(template.data);
    if (!parsed.success) {
      throw new BadRequestException(`Template data is invalid: ${parsed.error.message}`);
    }
    const templateData = parsed.data;

    const operationalConfig =
      await this.clinicService.getOperationalConfig(clinicId);
    const shiftTypes = await this.clinicService.listShiftTypes(clinicId);

    const shiftTypeMap = new Map(
      shiftTypes.map((st) => [
        st.code,
        { startTime: st.startTime, endTime: st.endTime, breakMinutes: st.breakMinutes },
      ]),
    );

    const rawSlots = this.expandTemplateToMonth(
      templateData,
      month,
      operationalConfig,
      shiftTypeMap,
    );

    // Reorder slots: within each ISO week, process non-workday slots BEFORE workday slots.
    // This ensures employees still have weekly budget for hard-to-fill non-workday slots.
    const workDaySet = new Set(
      operationalConfig.workDays.map((d: string) => {
        const map: Record<string, number> = {
          MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4,
          FRIDAY: 5, SATURDAY: 6, SUNDAY: 7,
          '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
        };
        return map[d] || 0;
      }).filter(Boolean),
    );
    const slots = this.reorderSlotsNonWorkDaysFirst(rawSlots, workDaySet);

    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
    const weeksInMonth = daysInMonth / 7;
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(
      Date.UTC(year, monthNum, 0, 23, 59, 59, 999),
    );

    const constraints = await this.loadConstraints(
      clinicId,
      monthStart,
      monthEnd,
      year,
      monthNum,
    );

    const employees = await this.prisma.employee.findMany({
      where: { clinicId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        jobType: true,
        contractHours: true,
      },
    });

    // Pre-check: all apprentices must have school day declarations
    const undeclared = await this.apprenticeDeclarationService.getUndeclaredApprentices(clinicId, month);
    if (undeclared.length > 0) {
      const names = undeclared.map(a => `${a.firstName} ${a.lastName}`).join(', ');
      throw new BadRequestException(
        `Cannot generate: apprentice school day declarations missing for ${month}. Undeclared: ${names}`,
      );
    }

    // Load existing shifts from adjacent months for border ISO weeks.
    // This ensures weekly hour calculations are correct when weeks straddle month boundaries.
    const borderShifts = await this.loadBorderWeekShifts(clinicId, month);

    const assignedShifts: AssignedShift[] = [];
    const assignmentIndex = new Map<string, AssignedShift[]>();

    // Pre-seed assignmentIndex with border shifts (for overlap/consecutive checks)
    for (const bs of borderShifts) {
      const key = `${bs.employeeId}|${bs.date}`;
      const existing = assignmentIndex.get(key) || [];
      existing.push(bs);
      assignmentIndex.set(key, existing);
    }

    // allShiftsForScoring includes border + newly assigned (for weekly hour calculation)
    const allShiftsForScoring: AssignedShift[] = [...borderShifts];

    const holes: GenerationResult['holes'] = [];
    const hardViolations: GenerationResult['violations']['hard'] = [];
    const softViolations: GenerationResult['violations']['soft'] = [];
    const employeeMinutes = new Map<string, number>();
    let totalPositions = 0;

    for (const slot of slots) {
      totalPositions += slot.requiredStaff;

      const result = this.scoreAndAssign(
        slot,
        employees,
        constraints,
        allShiftsForScoring,
        assignmentIndex,
        employeeMinutes,
        weeksInMonth,
      );

      assignedShifts.push(...result.assigned);
      allShiftsForScoring.push(...result.assigned);
      for (const a of result.assigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }
      if (result.holeInfo) holes.push(result.holeInfo);
      hardViolations.push(...result.hardViolations);
      softViolations.push(...result.softViolations);
    }

    let createdShifts: Array<{
      id: string;
      employeeId: string;
      date: Date;
      startTime: string;
      endTime: string;
      shiftTypeCode: string;
    }>;
    try {
      createdShifts = await this.prisma.$transaction(async (tx) => {
        // Delete existing generated shifts first (inside transaction for atomicity)
        await tx.shift.deleteMany({
          where: { clinicId, source: 'GENERATED', date: { gte: monthStart, lte: monthEnd } },
        });

        if (assignedShifts.length === 0) return [];
        return tx.shift.createManyAndReturn({
          data: assignedShifts.map((s) => ({
            date: new Date(`${s.date}T00:00:00.000Z`),
            startTime: s.startTime,
            endTime: s.endTime,
            shiftTypeCode: s.shiftTypeCode,
            breakMinutes: s.breakMinutes || 0,
            source: 'GENERATED' as const,
            employeeId: s.employeeId,
            clinicId,
            planningTemplateId: templateId,
          })),
        });
      });
    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError.code === 'P2002') {
        throw new ConflictException('Duplicate shift detected during generation');
      }
      this.logger.error('Transaction failed during shift generation', error);
      throw new InternalServerErrorException('Failed to persist generated shifts');
    }

    return this.buildResult(
      createdShifts,
      employees,
      holes,
      hardViolations,
      softViolations,
      totalPositions,
    );
  }

  private expandTemplateToMonth(
    template: TemplateData,
    month: string,
    operationalConfig: {
      closedDays: Array<{ date: string }>;
      specialDays: Array<{
        date: string;
        startTime: string;
        endTime: string;
      }>;
    },
    shiftTypeMap: Map<string, { startTime: string; endTime: string; breakMinutes: number }>,
  ): SlotRequirement[] {
    const [year, monthNum] = month.split('-').map(Number);
    const firstDay = new Date(Date.UTC(year, monthNum - 1, 1));
    const lastDay = new Date(Date.UTC(year, monthNum, 0));

    const closedDateSet = new Set(
      operationalConfig.closedDays.map((cd) => cd.date),
    );
    const specialDayMap = new Map(
      operationalConfig.specialDays.map((sd) => [
        sd.date,
        { startTime: sd.startTime, endTime: sd.endTime },
      ]),
    );

    const templateDayNumbers = new Set(
      template.days.map((d) => d.dayOfWeek),
    );

    const slots: SlotRequirement[] = [];
    const cursor = new Date(firstDay);

    while (cursor <= lastDay) {
      const dateStr = cursor.toISOString().split('T')[0];
      const isoDay = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();

      if (closedDateSet.has(dateStr)) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      if (!templateDayNumbers.has(isoDay)) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      const templateDay = template.days.find(
        (d) => d.dayOfWeek === isoDay,
      );
      if (!templateDay) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      for (const templateSlot of templateDay.slots) {
        const shiftTimes = shiftTypeMap.get(templateSlot.shiftTypeCode);
        if (!shiftTimes) continue;

        // Only apply special-day override if the shift's default times overlap
        // with the special-day window — avoids collapsing multiple shift types
        // (e.g., MORNING + AFTERNOON) into identical times.
        const specialDay = specialDayMap.get(dateStr);
        let startTime = shiftTimes.startTime;
        let endTime = shiftTimes.endTime;
        if (
          specialDay &&
          this.timesOverlap(
            shiftTimes.startTime,
            shiftTimes.endTime,
            specialDay.startTime,
            specialDay.endTime,
          )
        ) {
          // Clamp shift times to the special-day window
          startTime =
            shiftTimes.startTime < specialDay.startTime
              ? specialDay.startTime
              : shiftTimes.startTime;
          endTime =
            shiftTimes.endTime > specialDay.endTime
              ? specialDay.endTime
              : shiftTimes.endTime;
        }

        slots.push({
          date: dateStr,
          shiftTypeCode: templateSlot.shiftTypeCode,
          startTime,
          endTime,
          breakMinutes: shiftTimes.breakMinutes,
          requiredStaff: templateSlot.requiredStaff,
          requiredJobTypes: templateSlot.requiredJobTypes,
        });
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return slots;
  }

  private async loadConstraints(
    clinicId: string,
    monthStart: Date,
    monthEnd: Date,
    year: number,
    month: number,
  ): Promise<ConstraintMap> {
    const unavailabilities = await this.prisma.unavailability.findMany({
      where: {
        clinicId,
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
    });

    const unavailableMap = new Map<string, Set<string>>();
    const schoolDayMap = new Map<string, Set<string>>();

    for (const ua of unavailabilities) {
      const empDates =
        unavailableMap.get(ua.employeeId) || new Set<string>();
      const isSchool = ua.type === 'SCHOOL';
      const schoolDates = isSchool
        ? (schoolDayMap.get(ua.employeeId) || new Set<string>())
        : null;

      const effectiveStart =
        ua.startDate > monthStart ? ua.startDate : monthStart;
      const effectiveEnd =
        ua.endDate < monthEnd ? ua.endDate : monthEnd;

      if (ua.daysOfWeek.length === 0) {
        const cursor = new Date(effectiveStart);
        while (cursor <= effectiveEnd) {
          const dateStr = cursor.toISOString().split('T')[0];
          empDates.add(dateStr);
          if (schoolDates) schoolDates.add(dateStr);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      } else {
        const cursor = new Date(effectiveStart);
        while (cursor <= effectiveEnd) {
          const isoDay =
            cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
          if (ua.daysOfWeek.includes(isoDay)) {
            const dateStr = cursor.toISOString().split('T')[0];
            empDates.add(dateStr);
            if (schoolDates) schoolDates.add(dateStr);
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }

      unavailableMap.set(ua.employeeId, empDates);
      if (schoolDates) schoolDayMap.set(ua.employeeId, schoolDates);
    }

    const rules = await this.planningService.listRules(clinicId, {
      isActive: true,
    });
    const mapRule = (r: { id: string; name: string; category: string; config: unknown; priority: number }): RuleEntry => ({
      id: r.id,
      name: r.name,
      category: r.category,
      config: r.config as Record<string, unknown>,
      priority: r.priority,
    });
    const hardRules = rules.filter((r) => r.ruleType === 'HARD').map(mapRule);
    const softRules = rules.filter((r) => r.ruleType === 'SOFT').map(mapRule);

    // Load all months up to the target month for cumulative equity data
    const allMonths = Array.from({ length: month }, (_, i) => i + 1);
    const counters = await this.equityCounterService.getCountersForPeriod(
      clinicId,
      year,
      allMonths,
    );
    const equityMap = new Map<
      string,
      {
        saturdayCount: number;
        weekendCount: number;
        holidayCount: number;
        overtimeMinutes: number;
      }
    >();

    for (const counter of counters) {
      const existing = equityMap.get(counter.employee.id) || {
        saturdayCount: 0,
        weekendCount: 0,
        holidayCount: 0,
        overtimeMinutes: 0,
      };

      switch (counter.counterType) {
        case 'SATURDAY_WORKED':
          existing.saturdayCount += counter.count;
          break;
        case 'WEEKEND_TOTAL':
          existing.weekendCount += counter.count;
          break;
        case 'HOLIDAY_WORKED':
          existing.holidayCount += counter.count;
          break;
        case 'OVERTIME_HOURS':
          existing.overtimeMinutes += counter.count;
          break;
      }

      equityMap.set(counter.employee.id, existing);
    }

    // Load quarterly historical shifts if any ROTATION_EQUITY rule uses quarterly tracking
    const allRules = [...hardRules, ...softRules];
    const needsQuarterly = allRules.some(
      (r) => r.category === 'ROTATION_EQUITY' && r.config.trackingPeriod === 'quarterly',
    );

    let quarterlyShifts: AssignedShift[] = [];
    if (needsQuarterly) {
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      const otherMonths = [quarterStartMonth, quarterStartMonth + 1, quarterStartMonth + 2]
        .filter((m) => m !== month && m >= 1 && m <= 12);

      if (otherMonths.length > 0) {
        const dateRanges = otherMonths.map((m) => ({
          gte: new Date(Date.UTC(year, m - 1, 1)),
          lte: new Date(Date.UTC(year, m, 0, 23, 59, 59, 999)),
        }));

        const historicalShifts = await this.prisma.shift.findMany({
          where: {
            clinicId,
            OR: dateRanges.map((d) => ({ date: { gte: d.gte, lte: d.lte } })),
          },
          select: {
            employeeId: true,
            date: true,
            startTime: true,
            endTime: true,
            shiftTypeCode: true,
          },
        });

        quarterlyShifts = historicalShifts.map((s) => ({
          employeeId: s.employeeId,
          date: s.date.toISOString().split('T')[0],
          startTime: s.startTime,
          endTime: s.endTime,
          shiftTypeCode: s.shiftTypeCode,
        }));
      }
    }

    return { unavailableMap, schoolDayMap, hardRules, softRules, equityMap, quarterlyShifts };
  }

  private scoreAndAssign(
    slot: SlotRequirement,
    employees: EmployeeInfo[],
    constraints: ConstraintMap,
    alreadyAssigned: AssignedShift[],
    assignmentIndex: Map<string, AssignedShift[]>,
    employeeMinutes: Map<string, number>,
    weeksInMonth: number,
  ): {
    assigned: AssignedShift[];
    holeInfo?: GenerationResult['holes'][number];
    hardViolations: GenerationResult['violations']['hard'];
    softViolations: GenerationResult['violations']['soft'];
  } {
    const assigned: AssignedShift[] = [];
    const hardViols: GenerationResult['violations']['hard'] = [];
    const softViols: GenerationResult['violations']['soft'] = [];

    // Pre-compute values needed by eligibility filter
    const slotMinutes = this.calculateShiftMinutes(slot.startTime, slot.endTime) - (slot.breakMinutes || 0);
    const weekBounds = this.getWeekBounds(slot.date);

    // Compute weekly minutes for ALL employees (needed for HARD CONTRACT_COMPLIANCE filter)
    const weeklyMinutesMap = new Map<string, number>();
    for (const emp of employees) {
      let weekMin = 0;
      for (const a of alreadyAssigned) {
        if (a.employeeId !== emp.id) continue;
        if (a.date >= weekBounds.start && a.date <= weekBounds.end) {
          weekMin += this.calculateShiftMinutes(a.startTime, a.endTime) - (a.breakMinutes || 0);
        }
      }
      const schoolDates = constraints.schoolDayMap.get(emp.id);
      if (schoolDates) {
        for (const date of schoolDates) {
          if (date >= weekBounds.start && date <= weekBounds.end) {
            weekMin += PlanningGenerationService.SCHOOL_DAY_MINUTES;
          }
        }
      }
      weeklyMinutesMap.set(emp.id, weekMin);
    }

    // Pre-compute shift type counts per employee for diversity scoring
    const employeeShiftTypeCounts = new Map<string, Map<string, number>>();
    for (const a of alreadyAssigned) {
      let typeCounts = employeeShiftTypeCounts.get(a.employeeId);
      if (!typeCounts) {
        typeCounts = new Map();
        employeeShiftTypeCounts.set(a.employeeId, typeCounts);
      }
      typeCounts.set(a.shiftTypeCode, (typeCounts.get(a.shiftTypeCode) || 0) + 1);
    }

    // Extract HARD CONTRACT_COMPLIANCE rules for eligibility filter
    const hardContractRules = constraints.hardRules.filter(
      (r) => r.category === 'CONTRACT_COMPLIANCE',
    );

    // Filter eligible employees — track rotation-equity-blocked separately for fallback
    const rotationEquityBlocked: EmployeeInfo[] = [];
    const eligible = employees.filter((emp) => {
      const unavailDates = constraints.unavailableMap.get(emp.id);
      if (unavailDates?.has(slot.date)) return false;

      const key = `${emp.id}|${slot.date}`;
      const existingOnDate = assignmentIndex.get(key) || [];
      for (const existing of existingOnDate) {
        if (
          this.timesOverlap(
            slot.startTime,
            slot.endTime,
            existing.startTime,
            existing.endTime,
          )
        ) {
          return false;
        }
      }

      if (
        slot.requiredJobTypes &&
        slot.requiredJobTypes.length > 0 &&
        !slot.requiredJobTypes.includes(emp.jobType)
      ) {
        return false;
      }

      // FIX 1: HARD ROTATION_EQUITY with trackingPeriod support
      for (const rule of constraints.hardRules) {
        if (rule.category === 'ROTATION_EQUITY') {
          if (this.violatesHardRotationEquity(rule, slot, emp, alreadyAssigned, constraints.quarterlyShifts)) {
            rotationEquityBlocked.push(emp);
            return false;
          }
        }
      }

      // FIX 1: HARD CONTRACT_COMPLIANCE — block if exceeding hard limits
      // Per-employee contractHours is always the base; rule maxWeeklyHours is an additional cap
      for (const rule of hardContractRules) {
        const config = rule.config;
        const overtimeTol = 1 + ((config.overtimeThresholdPercent as number) || 0) / 100;

        const ruleWeekly = config.maxWeeklyHours as number | undefined;
        const effectiveWeeklyLimit = ruleWeekly
          ? Math.min(emp.contractHours, ruleWeekly)
          : emp.contractHours;
        const weekMin = weeklyMinutesMap.get(emp.id) || 0;
        const projectedWeekMin = weekMin + slotMinutes;
        if (projectedWeekMin > effectiveWeeklyLimit * 60 * overtimeTol) return false;

        if (config.maxMonthlyHours) {
          const monthMin = employeeMinutes.get(emp.id) || 0;
          const projectedMonthMin = monthMin + slotMinutes;
          const hardLimitMin = (config.maxMonthlyHours as number) * 60 * overtimeTol;
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
            const rest = (24 * 60 - this.toMinutes(prev.endTime)) + this.toMinutes(slot.startTime);
            if (rest < minRestMin) return false;
          }
          // Check next day: rest = gap from this shift end to next shift start
          const nextDate = this.getNextDate(slot.date);
          const nextShifts = assignmentIndex.get(`${emp.id}|${nextDate}`) || [];
          for (const next of nextShifts) {
            const rest = (24 * 60 - this.toMinutes(slot.endTime)) + this.toMinutes(next.startTime);
            if (rest < minRestMin) return false;
          }
        }
      }

      return true;
    });

    // Fallback: if not enough eligible employees but some were only blocked by
    // ROTATION_EQUITY, re-admit them to avoid leaving the slot empty.
    // Better to slightly exceed rotation limits than create holes.
    if (eligible.length < slot.requiredStaff && rotationEquityBlocked.length > 0) {
      eligible.push(...rotationEquityBlocked);
      for (const emp of rotationEquityBlocked) {
        softViols.push({
          ruleId: constraints.hardRules.find(r => r.category === 'ROTATION_EQUITY')?.id || '00000000-0000-0000-0000-000000000000',
          ruleName: 'Rotation equity relaxed',
          category: 'ROTATION_EQUITY',
          message: `${emp.firstName} ${emp.lastName} assigned to ${slot.shiftTypeCode} on ${slot.date} despite reaching rotation limit (no other employee available)`,
          affectedEmployeeId: emp.id,
          affectedDate: slot.date,
          severity: 'warning' as const,
        });
      }
    }

    // Check HARD rules (slot-level: STAFFING_MINIMUM, SKILL_REQUIREMENT)
    for (const rule of constraints.hardRules) {
      if (
        rule.category === 'STAFFING_MINIMUM' &&
        rule.config.shiftTypeCode === slot.shiftTypeCode
      ) {
        const minStaff = rule.config.minStaff as number;
        const jobTypes = rule.config.jobTypes as string[] | undefined;
        const matchingEligible = jobTypes
          ? eligible.filter((e) => jobTypes.includes(e.jobType))
          : eligible;

        if (matchingEligible.length < minStaff) {
          hardViols.push({
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            message: `Only ${matchingEligible.length} eligible for ${slot.shiftTypeCode} on ${slot.date}, minimum ${minStaff} required`,
            affectedDate: slot.date,
            severity: 'blocking' as const,
          });
        }
      }

      if (
        rule.category === 'SKILL_REQUIREMENT' &&
        rule.config.shiftTypeCode === slot.shiftTypeCode
      ) {
        const requiredJobTypes = rule.config.requiredJobTypes as string[];
        const availableJobTypes = new Set(eligible.map((e) => e.jobType));
        const missing = requiredJobTypes.filter(
          (jt) => !availableJobTypes.has(jt),
        );

        if (missing.length > 0) {
          hardViols.push({
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            message: `Missing required job type(s) ${missing.join(', ')} for ${slot.shiftTypeCode} on ${slot.date}`,
            affectedDate: slot.date,
            severity: 'blocking' as const,
          });
        }
      }
    }

    if (hardViols.length > 0) {
      const holeInfo: GenerationResult['holes'][number] = {
        date: slot.date,
        shiftTypeCode: slot.shiftTypeCode,
        requiredStaff: slot.requiredStaff,
        assignedStaff: 0,
        reason: `Hard rule violated: ${hardViols.map(v => v.ruleName).join(', ')}`,
      };
      return { assigned: [], holeInfo, hardViolations: hardViols, softViolations: [] };
    }

    // Build shift count index for monthly workload balancing
    const employeeShiftCounts = new Map<string, number>();
    for (const a of alreadyAssigned) {
      employeeShiftCounts.set(a.employeeId, (employeeShiftCounts.get(a.employeeId) || 0) + 1);
    }
    const eligibleShiftCounts = eligible.map(e => employeeShiftCounts.get(e.id) || 0);
    const avgShifts = eligibleShiftCounts.length > 0
      ? eligibleShiftCounts.reduce((sum, c) => sum + c, 0) / eligibleShiftCounts.length
      : 0;

    // Global weekly cap from CONTRACT_COMPLIANCE rules (if any)
    const allContractRules = [
      ...constraints.hardRules.filter(r => r.category === 'CONTRACT_COMPLIANCE'),
      ...constraints.softRules.filter(r => r.category === 'CONTRACT_COMPLIANCE'),
    ];
    const ruleWeeklyCap = allContractRules
      .map(r => r.config.maxWeeklyHours as number | undefined)
      .find(v => v !== undefined);

    // Score each eligible employee
    const scored = eligible.map((emp) => {
      let score = 100;

      // FIX 7: Full equity scoring (weekend, holiday, overtime)
      const equity = constraints.equityMap.get(emp.id);
      if (equity) {
        const date = new Date(`${slot.date}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay();
        const isSaturday = dayOfWeek === 6;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isWeekend) {
          const avgWeekend = this.getAverageEquity(constraints.equityMap, 'weekendCount');
          if (equity.weekendCount < avgWeekend) score += 10;

          if (isSaturday) {
            const avgSaturday = this.getAverageEquity(constraints.equityMap, 'saturdayCount');
            if (equity.saturdayCount < avgSaturday) score += 10;
          }
        }

        // FIX 7: Holiday equity — prefer employees with fewer holiday shifts
        const avgHoliday = this.getAverageEquity(constraints.equityMap, 'holidayCount');
        if (equity.holidayCount < avgHoliday) {
          score += 5;
        } else if (equity.holidayCount > avgHoliday + 1) {
          score -= 5;
        }

        // FIX 7: Overtime equity — penalize employees with more historical overtime
        const avgOvertime = this.getAverageOvertimeMinutes(constraints.equityMap);
        if (equity.overtimeMinutes > avgOvertime) {
          score -= Math.round(((equity.overtimeMinutes - avgOvertime) / 60) * 5);
        }
      } else {
        score += 20;
      }

      // Monthly contract fit bonus
      const currentMinutes = employeeMinutes.get(emp.id) || 0;
      const monthlyLimitMinutes =
        emp.contractHours * 60 * weeksInMonth;
      if (currentMinutes + slotMinutes <= monthlyLimitMinutes) {
        score += 10;
      }

      // Job type match bonus
      if (slot.requiredJobTypes?.includes(emp.jobType)) {
        score += 15;
      }

      // Monthly workload balancing — stronger penalty for excess
      const shiftCount = employeeShiftCounts.get(emp.id) || 0;
      const excessShifts = shiftCount - avgShifts;
      if (excessShifts > 0) {
        score -= Math.round(excessShifts * 25);
      } else if (excessShifts < -1) {
        // Bonus for under-utilized employees (fewer shifts than average)
        score += Math.round(Math.abs(excessShifts) * 15);
      }

      // Weekly hours scoring — DOMINANT factor for intra-week balance
      // This is the primary mechanism to prevent one employee getting 40h while another has 30h
      const weekMin = weeklyMinutesMap.get(emp.id) || 0;
      const projectedWeekMin = weekMin + slotMinutes;
      const effectiveWeeklyHours = ruleWeeklyCap
        ? Math.min(emp.contractHours, ruleWeeklyCap)
        : emp.contractHours;
      const weeklyLimitMin = effectiveWeeklyHours * 60;
      if (projectedWeekMin > weeklyLimitMin) {
        // Over weekly limit → strong penalty
        const overHours = (projectedWeekMin - weeklyLimitMin) / 60;
        score -= Math.round(overHours * 40);
      } else {
        // Under weekly limit → strong bonus proportional to remaining capacity
        const remainingRatio = (weeklyLimitMin - projectedWeekMin) / weeklyLimitMin;
        score += Math.round(remainingRatio * 50);
      }

      // Fill-to-contract bonus: heavily prefer employees far below their weekly contract
      // An employee at 0h should massively outscore one at 30h
      const weeklyUsageRatio = weekMin / weeklyLimitMin;
      if (weeklyUsageRatio < 0.5) {
        score += 30; // far from limit — strong preference
      } else if (weeklyUsageRatio < 0.8) {
        score += 15; // moderate headroom
      }

      // Consecutive days penalty
      let consecutiveDays = 0;
      let checkDate = this.getPreviousDate(slot.date);
      while (consecutiveDays < 6 && (assignmentIndex.get(`${emp.id}|${checkDate}`) || []).length > 0) {
        consecutiveDays++;
        checkDate = this.getPreviousDate(checkDate);
      }
      score -= consecutiveDays * 8;

      // Shift type diversity — penalize repeated same shift type to encourage rotation
      const empTypeCounts = employeeShiftTypeCounts.get(emp.id);
      const sameTypeCount = empTypeCounts?.get(slot.shiftTypeCode) || 0;
      score -= sameTypeCount * 15;

      // Yesterday same-type penalty — strongly discourage consecutive days on same shift type
      const prevDate = this.getPreviousDate(slot.date);
      const prevDayShifts = assignmentIndex.get(`${emp.id}|${prevDate}`) || [];
      if (prevDayShifts.some(s => s.shiftTypeCode === slot.shiftTypeCode)) {
        score -= 20;
      }

      // FIX 5: Soft rule scoring adjustments weighted by priority
      for (const rule of constraints.softRules) {
        const priorityWeight = 1 + rule.priority / 10;

        if (rule.category === 'ROTATION_EQUITY') {
          const applicableJT = rule.config.applicableJobTypes as string[] | undefined;
          if (!applicableJT || applicableJT.length === 0 || applicableJT.includes(emp.jobType)) {
            const trackingPeriod = rule.config.trackingPeriod as string | undefined;
            const count = this.countTargetDayShifts(
              rule, emp, alreadyAssigned, constraints.quarterlyShifts, trackingPeriod,
            );
            const maxPerPeriod = rule.config.maxPerPeriod as number;
            if (count >= maxPerPeriod) {
              score -= Math.round(25 * priorityWeight);
            }
          }
        }

        if (rule.category === 'CONTRACT_COMPLIANCE') {
          const maxWeekly = rule.config.maxWeeklyHours as number | undefined;
          if (maxWeekly && projectedWeekMin > maxWeekly * 60) {
            const overHours = (projectedWeekMin - maxWeekly * 60) / 60;
            score -= Math.round(overHours * 15 * priorityWeight);
          }
          const maxMonthly = rule.config.maxMonthlyHours as number | undefined;
          if (maxMonthly && (currentMinutes + slotMinutes) > maxMonthly * 60) {
            const overHours = ((currentMinutes + slotMinutes) - maxMonthly * 60) / 60;
            score -= Math.round(overHours * 10 * priorityWeight);
          }
        }
      }

      return { employee: emp, score };
    });

    // Sort by score descending, with deterministic tiebreaker for reproducibility
    const sortScored = (items: typeof scored) => {
      items.sort((a, b) => {
        const diff = b.score - a.score;
        if (diff !== 0) return diff;
        // 1. Fewer shifts this month wins
        const aShifts = employeeShiftCounts.get(a.employee.id) || 0;
        const bShifts = employeeShiftCounts.get(b.employee.id) || 0;
        if (aShifts !== bShifts) return aShifts - bShifts;
        // 2. Fewer weekends wins
        const aWe = constraints.equityMap.get(a.employee.id)?.weekendCount ?? 0;
        const bWe = constraints.equityMap.get(b.employee.id)?.weekendCount ?? 0;
        if (aWe !== bWe) return aWe - bWe;
        // 3. employeeId ascending (stable)
        return a.employee.id.localeCompare(b.employee.id);
      });
    };

    // Build pairing counts from already-assigned shifts (co-assignments on same date+shiftType)
    const pairingCounts = new Map<string, Map<string, number>>();
    if (slot.requiredStaff > 1) {
      const slotGroups = new Map<string, string[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.date}|${a.shiftTypeCode}`;
        const group = slotGroups.get(key) || [];
        group.push(a.employeeId);
        slotGroups.set(key, group);
      }
      for (const group of slotGroups.values()) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i], b = group[j];
            if (!pairingCounts.has(a)) pairingCounts.set(a, new Map());
            if (!pairingCounts.has(b)) pairingCounts.set(b, new Map());
            pairingCounts.get(a)!.set(b, (pairingCounts.get(a)!.get(b) || 0) + 1);
            pairingCounts.get(b)!.set(a, (pairingCounts.get(b)!.get(a) || 0) + 1);
          }
        }
      }
    }

    // Sequential assignment with pairing penalty for multi-staff slots
    const toAssign: typeof scored = [];
    sortScored(scored);

    if (slot.requiredStaff <= 1 || scored.length <= 1) {
      toAssign.push(...scored.slice(0, slot.requiredStaff));
    } else {
      // First pick: best score (no pairing penalty)
      toAssign.push(scored[0]);
      const remaining = scored.slice(1);

      for (let pick = 1; pick < slot.requiredStaff && remaining.length > 0; pick++) {
        // Apply pairing penalty to remaining candidates
        for (const candidate of remaining) {
          let pairingPenalty = 0;
          for (const selected of toAssign) {
            const count = pairingCounts.get(candidate.employee.id)?.get(selected.employee.id) || 0;
            pairingPenalty += count * 10;
          }
          candidate.score -= pairingPenalty;
        }
        sortScored(remaining);
        toAssign.push(remaining.shift()!);
      }
    }

    for (const { employee } of toAssign) {
      // Check all SOFT rule violations for this assignment
      for (const rule of constraints.softRules) {
        if (rule.category === 'ROTATION_EQUITY') {
          this.checkRotationEquity(
            rule, slot, employee, alreadyAssigned,
            constraints.quarterlyShifts, softViols,
          );
        }

        if (rule.category === 'CONTRACT_COMPLIANCE') {
          this.checkContractCompliance(
            rule, slot, employee, employeeMinutes,
            weeklyMinutesMap, softViols,
          );
        }

        // FIX 6: SOFT STAFFING_MINIMUM warning
        if (
          rule.category === 'STAFFING_MINIMUM' &&
          rule.config.shiftTypeCode === slot.shiftTypeCode
        ) {
          const minStaff = rule.config.minStaff as number;
          const jobTypes = rule.config.jobTypes as string[] | undefined;
          const matchingEligible = jobTypes
            ? eligible.filter((e) => jobTypes.includes(e.jobType))
            : eligible;
          if (matchingEligible.length < minStaff) {
            softViols.push({
              ruleId: rule.id,
              ruleName: rule.name,
              category: rule.category,
              message: `Only ${matchingEligible.length} eligible for ${slot.shiftTypeCode} on ${slot.date}, recommended minimum ${minStaff}`,
              affectedEmployeeId: employee.id,
              affectedDate: slot.date,
              severity: 'warning' as const,
            });
          }
        }

        // FIX 6: SOFT SKILL_REQUIREMENT warning
        if (
          rule.category === 'SKILL_REQUIREMENT' &&
          rule.config.shiftTypeCode === slot.shiftTypeCode
        ) {
          const requiredJobTypes = rule.config.requiredJobTypes as string[];
          const assignedJobTypes = new Set(
            [...toAssign.map(t => t.employee.jobType), ...assigned.map(a => {
              const e = employees.find(emp => emp.id === a.employeeId);
              return e?.jobType || '';
            })],
          );
          const missing = requiredJobTypes.filter(jt => !assignedJobTypes.has(jt));
          if (missing.length > 0) {
            softViols.push({
              ruleId: rule.id,
              ruleName: rule.name,
              category: rule.category,
              message: `Missing recommended job type(s) ${missing.join(', ')} for ${slot.shiftTypeCode} on ${slot.date}`,
              affectedEmployeeId: employee.id,
              affectedDate: slot.date,
              severity: 'warning' as const,
            });
          }
        }
      }

      assigned.push({
        employeeId: employee.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        shiftTypeCode: slot.shiftTypeCode,
        breakMinutes: slot.breakMinutes,
      });

      const netMinutes = this.calculateShiftMinutes(slot.startTime, slot.endTime) - (slot.breakMinutes || 0);
      employeeMinutes.set(
        employee.id,
        (employeeMinutes.get(employee.id) || 0) + netMinutes,
      );
    }

    let holeInfo: GenerationResult['holes'][number] | undefined;
    if (toAssign.length < slot.requiredStaff) {
      let reason = 'Not enough eligible employees';
      if (eligible.length === 0) {
        reason = 'No eligible employees available';
      } else if (eligible.length < slot.requiredStaff) {
        reason = `Only ${eligible.length} eligible, ${slot.requiredStaff} required`;
      }

      holeInfo = {
        date: slot.date,
        shiftTypeCode: slot.shiftTypeCode,
        requiredStaff: slot.requiredStaff,
        assignedStaff: toAssign.length,
        reason,
      };
    }

    return { assigned, holeInfo, hardViolations: hardViols, softViolations: softViols };
  }

  async deleteGeneratedShifts(
    clinicId: string,
    month: string,
  ): Promise<{ deletedCount: number }> {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(`Invalid month format: ${month}. Expected YYYY-MM`);
    }

    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(
      Date.UTC(year, monthNum, 0, 23, 59, 59, 999),
    );

    const { count } = await this.prisma.shift.deleteMany({
      where: {
        clinicId,
        source: 'GENERATED',
        date: { gte: monthStart, lte: monthEnd },
      },
    });

    return { deletedCount: count };
  }

  async listShiftsForMonth(clinicId: string, month: string): Promise<Array<{
    id: string;
    date: Date;
    startTime: string;
    endTime: string;
    shiftTypeCode: string;
    source: string;
    employeeId: string;
    clinicId: string;
    employee: {
      id: string;
      firstName: string;
      lastName: string;
      color: string | null;
      jobType: string;
    };
  }>> {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(`Invalid month format: ${month}. Expected YYYY-MM`);
    }

    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(
      Date.UTC(year, monthNum, 0, 23, 59, 59, 999),
    );

    return this.prisma.shift.findMany({
      where: {
        clinicId,
        date: { gte: monthStart, lte: monthEnd },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            color: true,
            jobType: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  async getScheduleViewForMonth(
    clinicId: string,
    month: string,
  ): Promise<ScheduleViewData> {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(`Invalid month format: ${month}. Expected YYYY-MM`);
    }

    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    // Fetch all data in parallel to prevent API waterfalls
    const [
      employees,
      shifts,
      unavailabilities,
      operationalConfig,
      shiftTypes,
    ] = await Promise.all([
      this.prisma.employee.findMany({
        where: { clinicId, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          color: true,
          jobType: true,
          contractHours: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.shift.findMany({
        where: {
          clinicId,
          date: { gte: monthStart, lte: monthEnd },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.unavailability.findMany({
        where: {
          clinicId,
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
      }),
      this.clinicService.getOperationalConfig(clinicId),
      this.clinicService.listShiftTypes(clinicId),
    ]);

    // Build work day set from ClinicConfig.workDays (e.g., ["MONDAY", "TUESDAY", ...])
    const dayNameToIso: Record<string, number> = {
      MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7,
    };
    const workDaySet = new Set(
      operationalConfig.workDays.map((d: string) => dayNameToIso[d]).filter(Boolean),
    );

    // Build closed day and special day maps
    const closedDateSet = new Set(
      operationalConfig.closedDays.map((cd: { date: string }) => cd.date),
    );
    const specialDayMap = new Map(
      operationalConfig.specialDays.map((sd: { date: string; label?: string | null }) => [
        sd.date,
        sd.label || undefined,
      ]),
    );

    // Build days metadata
    const days: ScheduleDayInfo[] = [];
    const cursor = new Date(monthStart);
    while (cursor <= monthEnd) {
      const dateStr = cursor.toISOString().split('T')[0];
      const isoDay = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
      days.push({
        date: dateStr,
        dayOfWeek: isoDay,
        isWorkDay: workDaySet.has(isoDay),
        isClosed: closedDateSet.has(dateStr),
        isSpecialDay: specialDayMap.has(dateStr),
        specialDayLabel: specialDayMap.get(dateStr),
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Map employees to ScheduleEmployee
    const scheduleEmployees: ScheduleEmployee[] = employees.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      color: e.color,
      jobType: e.jobType,
      contractHours: e.contractHours,
    }));

    // Map shifts to ScheduleShift
    const shiftTypeColorMap = new Map(shiftTypes.map((st) => [st.code, st.color]));
    const scheduleShifts: ScheduleShift[] = shifts.map((s) => ({
      id: s.id,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      shiftTypeCode: s.shiftTypeCode,
      breakMinutes: s.breakMinutes,
      source: s.source as 'GENERATED' | 'MANUAL',
      employeeId: s.employeeId,
      isConfirmed: s.isConfirmed,
      shiftTypeColor: shiftTypeColorMap.get(s.shiftTypeCode) ?? null,
    }));

    // Expand unavailabilities to flat (employeeId, date, type) tuples
    const expandedUnavailabilities: ScheduleUnavailability[] = [];
    for (const ua of unavailabilities) {
      const effectiveStart = ua.startDate > monthStart ? ua.startDate : monthStart;
      const effectiveEnd = ua.endDate < monthEnd ? ua.endDate : monthEnd;

      if (ua.daysOfWeek.length === 0) {
        // One-time unavailability
        const uaCursor = new Date(effectiveStart);
        while (uaCursor <= effectiveEnd) {
          expandedUnavailabilities.push({
            employeeId: ua.employeeId,
            date: uaCursor.toISOString().split('T')[0],
            type: ua.type as 'VACATION' | 'SICK' | 'SCHOOL' | 'OTHER',
            reason: ua.reason || undefined,
          });
          uaCursor.setUTCDate(uaCursor.getUTCDate() + 1);
        }
      } else {
        // Recurring unavailability
        const uaCursor = new Date(effectiveStart);
        while (uaCursor <= effectiveEnd) {
          const isoDay = uaCursor.getUTCDay() === 0 ? 7 : uaCursor.getUTCDay();
          if (ua.daysOfWeek.includes(isoDay)) {
            expandedUnavailabilities.push({
              employeeId: ua.employeeId,
              date: uaCursor.toISOString().split('T')[0],
              type: ua.type as 'VACATION' | 'SICK' | 'SCHOOL' | 'OTHER',
              reason: ua.reason || undefined,
            });
          }
          uaCursor.setUTCDate(uaCursor.getUTCDate() + 1);
        }
      }
    }

    // Detect holes by comparing template expectations vs actual shifts
    let holes: ScheduleHole[] = [];
    const templateId = shifts.find((s) => s.source === 'GENERATED' && s.planningTemplateId)?.planningTemplateId;

    // Parallelize template fetch + validation rules
    const [template, validationResult] = await Promise.all([
      templateId
        ? this.planningTemplateService.getTemplateById(clinicId, templateId).catch(() => {
            this.logger.warn(`Template ${templateId} not found for hole detection`);
            return null;
          })
        : Promise.resolve(null),
      this.planningService.validateShiftsAgainstRules(clinicId, {
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString(),
      }).catch(() => {
        this.logger.warn('Failed to validate shifts against rules');
        return { hardViolations: [] as any[], softViolations: [] as any[] };
      }),
    ]);

    // Compute holes from template if available
    if (template) {
      const parsed = templateDataSchema.safeParse(template.data);
      if (parsed.success) {
        const shiftTypeMap = new Map(
          shiftTypes.map((st) => [st.code, { startTime: st.startTime, endTime: st.endTime, breakMinutes: st.breakMinutes }]),
        );
        const slotRequirements = this.expandTemplateToMonth(
          parsed.data,
          month,
          operationalConfig,
          shiftTypeMap,
        );
        holes = this.computeHoles(slotRequirements, scheduleShifts);
      }
    }

    const violations: ScheduleViewData['violations'] = {
      hard: validationResult.hardViolations,
      soft: validationResult.softViolations,
    };

    return {
      month,
      employees: scheduleEmployees,
      days,
      shifts: scheduleShifts,
      unavailabilities: expandedUnavailabilities,
      holes,
      violations,
      templateId: templateId ?? undefined,
    };
  }

  private computeHoles(
    slotRequirements: SlotRequirement[],
    shifts: ScheduleShift[],
  ): ScheduleHole[] {
    // Index shifts by date+shiftTypeCode for O(1) lookup
    const shiftIndex = new Map<string, number>();
    for (const s of shifts) {
      const key = `${s.date}|${s.shiftTypeCode}`;
      shiftIndex.set(key, (shiftIndex.get(key) || 0) + 1);
    }

    const holes: ScheduleHole[] = [];
    // Aggregate slot requirements by (date, shiftTypeCode)
    const slotMap = new Map<string, SlotRequirement>();
    for (const slot of slotRequirements) {
      const key = `${slot.date}|${slot.shiftTypeCode}`;
      const existing = slotMap.get(key);
      if (existing) {
        existing.requiredStaff += slot.requiredStaff;
      } else {
        slotMap.set(key, { ...slot });
      }
    }

    for (const [key, slot] of slotMap) {
      const assignedCount = shiftIndex.get(key) || 0;
      if (assignedCount < slot.requiredStaff) {
        let reason = 'Not enough staff assigned';
        if (assignedCount === 0) {
          reason = 'No staff assigned';
        } else {
          reason = `Only ${assignedCount} of ${slot.requiredStaff} staff assigned`;
        }
        holes.push({
          date: slot.date,
          shiftTypeCode: slot.shiftTypeCode,
          requiredStaff: slot.requiredStaff,
          assignedStaff: assignedCount,
          reason,
        });
      }
    }

    return holes;
  }

  // FIX 4: checkRotationEquity now supports trackingPeriod (monthly/quarterly) + job type filter
  private checkRotationEquity(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    alreadyAssigned: AssignedShift[],
    quarterlyShifts: AssignedShift[],
    softViols: GenerationResult['violations']['soft'],
  ) {
    // Skip rule if it has applicableJobTypes and employee doesn't match
    const applicableJobTypes = rule.config.applicableJobTypes as string[] | undefined;
    if (applicableJobTypes && applicableJobTypes.length > 0 && !applicableJobTypes.includes(employee.jobType)) {
      return;
    }

    const targetDay = rule.config.targetDay as string;
    const maxPerPeriod = rule.config.maxPerPeriod as number;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return;

    const slotDate = new Date(`${slot.date}T00:00:00.000Z`);
    const slotIsoDay = slotDate.getUTCDay() === 0 ? 7 : slotDate.getUTCDay();
    if (slotIsoDay !== targetIsoDay) return;

    const shiftPool = trackingPeriod === 'quarterly'
      ? [...alreadyAssigned, ...quarterlyShifts]
      : alreadyAssigned;

    const count = shiftPool.filter((a) => {
      if (a.employeeId !== employee.id) return false;
      const d = new Date(`${a.date}T00:00:00.000Z`);
      const aIsoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      return aIsoDay === targetIsoDay;
    }).length;

    if (count + 1 > maxPerPeriod) {
      softViols.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        message: `Employee ${employee.firstName} ${employee.lastName} has ${count + 1} ${targetDay} shifts (${trackingPeriod || 'monthly'}), exceeds maximum of ${maxPerPeriod}`,
        affectedEmployeeId: employee.id,
        affectedDate: slot.date,
        severity: 'warning' as const,
      });
    }
  }

  // FIX 2+3: checkContractCompliance now handles maxWeeklyHours and overtimeThresholdPercent
  private checkContractCompliance(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    employeeMinutes: Map<string, number>,
    weeklyMinutesMap: Map<string, number>,
    softViols: GenerationResult['violations']['soft'],
  ) {
    const config = rule.config;
    const shiftMinutes = this.calculateShiftMinutes(slot.startTime, slot.endTime) - (slot.breakMinutes || 0);

    // Check maxMonthlyHours
    const maxMonthlyHours = config.maxMonthlyHours as number | undefined;
    if (maxMonthlyHours) {
      const currentMinutes = employeeMinutes.get(employee.id) || 0;
      const totalHours = Math.round((currentMinutes + shiftMinutes) / 60);
      if (totalHours > maxMonthlyHours) {
        softViols.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          message: `Employee ${employee.firstName} ${employee.lastName} total ${totalHours}h/month exceeds maximum ${maxMonthlyHours}h`,
          affectedEmployeeId: employee.id,
          affectedDate: slot.date,
          severity: 'warning' as const,
        });
      }
    }

    // FIX 2: Check maxWeeklyHours
    const maxWeeklyHours = config.maxWeeklyHours as number | undefined;
    if (maxWeeklyHours) {
      const weekMin = weeklyMinutesMap.get(employee.id) || 0;
      const projectedWeekHours = Math.round((weekMin + shiftMinutes) / 60);
      if (projectedWeekHours > maxWeeklyHours) {
        softViols.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          message: `Employee ${employee.firstName} ${employee.lastName} at ${projectedWeekHours}h/week exceeds maximum ${maxWeeklyHours}h`,
          affectedEmployeeId: employee.id,
          affectedDate: slot.date,
          severity: 'warning' as const,
        });
      }
    }
  }

  private buildResult(
    createdShifts: Array<{
      id: string;
      employeeId: string;
      date: Date;
      startTime: string;
      endTime: string;
      shiftTypeCode: string;
    }>,
    employees: EmployeeInfo[],
    holes: GenerationResult['holes'],
    hardViolations: GenerationResult['violations']['hard'],
    softViolations: GenerationResult['violations']['soft'],
    totalPositions: number,
  ): GenerationResult {
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const assignments = createdShifts.map((shift) => {
      const emp = employeeMap.get(shift.employeeId);
      return {
        id: shift.id,
        date: shift.date.toISOString().split('T')[0],
        startTime: shift.startTime,
        endTime: shift.endTime,
        shiftTypeCode: shift.shiftTypeCode,
        employeeId: shift.employeeId,
        employeeName: emp
          ? `${emp.firstName} ${emp.lastName}`
          : 'Unknown',
      };
    });

    return {
      assignments,
      holes,
      violations: {
        hard: hardViolations,
        soft: softViolations,
      },
      stats: {
        totalSlots: totalPositions,
        filledSlots: assignments.length,
        holeCount: holes.length,
        hardViolationCount: hardViolations.length,
        softWarningCount: softViolations.length,
      },
    };
  }

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
    return toMinutes(start1) < toMinutes(end2) && toMinutes(end1) > toMinutes(start2);
  }

  private calculateShiftMinutes(
    startTime: string,
    endTime: string,
  ): number {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : 1440 - startMinutes + endMinutes;
  }

  private getPreviousDate(dateStr: string): string {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().split('T')[0];
  }

  private getNextDate(dateStr: string): string {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().split('T')[0];
  }

  private toMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private getWeekBounds(dateStr: string): { start: string; end: string } {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon, ...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
    };
  }

  /**
   * Reorder slots so that within each ISO week, non-workday slots are processed
   * BEFORE workday slots, with edge work days (last work day before an off day)
   * getting intermediate priority. This 3-tier system prevents the greedy algorithm
   * from exhausting weekly budgets on regular work days and leaving harder-to-fill
   * edge and non-workday slots unfilled.
   *
   * Priority: non-work(0) → edge-work(1) → regular-work(2)
   * Example Mon-Sat clinic (Sun off): Sun(0) → Sat(1) → Mon-Fri(2)
   */
  private reorderSlotsNonWorkDaysFirst(
    slots: SlotRequirement[],
    workDaySet: Set<number>,
  ): SlotRequirement[] {
    // Identify edge work days: work days whose next day is NOT a work day
    const edgeWorkDays = new Set<number>();
    for (const isoDay of workDaySet) {
      const nextDay = isoDay === 7 ? 1 : isoDay + 1;
      if (!workDaySet.has(nextDay)) {
        edgeWorkDays.add(isoDay);
      }
    }

    // Group by ISO week
    const weekGroups = new Map<string, SlotRequirement[]>();
    for (const slot of slots) {
      const weekKey = this.getWeekBounds(slot.date).start;
      const group = weekGroups.get(weekKey) || [];
      group.push(slot);
      weekGroups.set(weekKey, group);
    }

    const getPriority = (isoDay: number): number => {
      if (!workDaySet.has(isoDay)) return 0;
      if (edgeWorkDays.has(isoDay)) return 1;
      return 2;
    };

    const result: SlotRequirement[] = [];
    const sortedWeeks = [...weekGroups.keys()].sort();
    for (const weekKey of sortedWeeks) {
      const group = weekGroups.get(weekKey)!;
      group.sort((a, b) => {
        const dateA = new Date(`${a.date}T00:00:00Z`);
        const dateB = new Date(`${b.date}T00:00:00Z`);
        const isoDayA = dateA.getUTCDay() === 0 ? 7 : dateA.getUTCDay();
        const isoDayB = dateB.getUTCDay() === 0 ? 7 : dateB.getUTCDay();
        const priorityA = getPriority(isoDayA);
        const priorityB = getPriority(isoDayB);
        if (priorityA !== priorityB) return priorityA - priorityB;
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        // Alternate intra-day slot order on even vs odd days to prevent
        // the same shift type from always being processed first
        const dayNum = dateA.getUTCDate();
        const direction = dayNum % 2 === 0 ? 1 : -1;
        return direction * a.startTime.localeCompare(b.startTime);
      });
      result.push(...group);
    }

    return result;
  }

  // FIX 4: violatesHardRotationEquity now supports quarterly tracking + job type filter
  private violatesHardRotationEquity(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    alreadyAssigned: AssignedShift[],
    quarterlyShifts: AssignedShift[],
  ): boolean {
    // Skip rule if it has applicableJobTypes and employee doesn't match
    const applicableJobTypes = rule.config.applicableJobTypes as string[] | undefined;
    if (applicableJobTypes && applicableJobTypes.length > 0 && !applicableJobTypes.includes(employee.jobType)) {
      return false;
    }

    const targetDay = rule.config.targetDay as string;
    const maxPerPeriod = rule.config.maxPerPeriod as number;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    const dayNameToIso: Record<string, number> = {
      monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
      friday: 5, saturday: 6, sunday: 7,
    };
    const targetIsoDay = dayNameToIso[targetDay];
    if (!targetIsoDay) return false;

    const slotDate = new Date(`${slot.date}T00:00:00.000Z`);
    const slotIsoDay = slotDate.getUTCDay() === 0 ? 7 : slotDate.getUTCDay();
    if (slotIsoDay !== targetIsoDay) return false;

    // FIX 4: Include quarterly historical shifts when trackingPeriod is "quarterly"
    const shiftPool = trackingPeriod === 'quarterly'
      ? [...alreadyAssigned, ...quarterlyShifts]
      : alreadyAssigned;

    const count = shiftPool.filter((a) => {
      if (a.employeeId !== employee.id) return false;
      const d = new Date(`${a.date}T00:00:00.000Z`);
      const aIsoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      return aIsoDay === targetIsoDay;
    }).length;

    return count >= maxPerPeriod;
  }

  private getAverageEquity(
    equityMap: Map<
      string,
      {
        saturdayCount: number;
        weekendCount: number;
        holidayCount: number;
        overtimeMinutes: number;
      }
    >,
    field: 'saturdayCount' | 'weekendCount' | 'holidayCount',
  ): number {
    if (equityMap.size === 0) return 0;
    let total = 0;
    for (const data of equityMap.values()) {
      total += data[field];
    }
    return total / equityMap.size;
  }

  // FIX 7: Average overtime minutes across all employees
  private getAverageOvertimeMinutes(
    equityMap: Map<string, { overtimeMinutes: number }>,
  ): number {
    if (equityMap.size === 0) return 0;
    let total = 0;
    for (const data of equityMap.values()) {
      total += data.overtimeMinutes;
    }
    return total / equityMap.size;
  }

  /**
   * Load existing shifts from DB for days in border ISO weeks that fall outside the generation month.
   * This ensures weekly hour calculations account for shifts already generated in adjacent months.
   * E.g., if March starts on Wednesday, loads Mon-Tue shifts from February for that ISO week.
   */
  private async loadBorderWeekShifts(
    clinicId: string,
    month: string,
  ): Promise<AssignedShift[]> {
    const [year, monthNum] = month.split('-').map(Number);
    const firstDayStr = new Date(Date.UTC(year, monthNum - 1, 1)).toISOString().split('T')[0];
    const lastDayStr = new Date(Date.UTC(year, monthNum, 0)).toISOString().split('T')[0];

    const firstWeek = this.getWeekBounds(firstDayStr);
    const lastWeek = this.getWeekBounds(lastDayStr);

    const borderDates: Date[] = [];

    // First week overlap: days before month start in the same ISO week
    if (firstWeek.start < firstDayStr) {
      const cursor = new Date(`${firstWeek.start}T00:00:00Z`);
      const limit = new Date(`${firstDayStr}T00:00:00Z`);
      while (cursor < limit) {
        borderDates.push(new Date(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    // Last week overlap: days after month end in the same ISO week
    if (lastWeek.end > lastDayStr) {
      const cursor = new Date(`${lastDayStr}T00:00:00Z`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const limit = new Date(`${lastWeek.end}T00:00:00Z`);
      while (cursor <= limit) {
        borderDates.push(new Date(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    if (borderDates.length === 0) return [];

    this.logger.debug(`Loading border week shifts for ${borderDates.length} days outside ${month}`);

    const shifts = await this.prisma.shift.findMany({
      where: {
        clinicId,
        date: { in: borderDates },
      },
      select: {
        employeeId: true,
        date: true,
        startTime: true,
        endTime: true,
        shiftTypeCode: true,
        breakMinutes: true,
      },
    });

    return shifts.map((s) => ({
      employeeId: s.employeeId,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      shiftTypeCode: s.shiftTypeCode,
      breakMinutes: s.breakMinutes,
    }));
  }

  // FIX 5: Count target-day shifts for an employee (monthly or quarterly)
  private countTargetDayShifts(
    rule: RuleEntry,
    employee: EmployeeInfo,
    alreadyAssigned: AssignedShift[],
    quarterlyShifts: AssignedShift[],
    trackingPeriod: string | undefined,
  ): number {
    const targetDay = rule.config.targetDay as string;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return 0;

    const shiftPool = trackingPeriod === 'quarterly'
      ? [...alreadyAssigned, ...quarterlyShifts]
      : alreadyAssigned;

    return shiftPool.filter((a) => {
      if (a.employeeId !== employee.id) return false;
      const d = new Date(`${a.date}T00:00:00.000Z`);
      const aIsoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      return aIsoDay === targetIsoDay;
    }).length;
  }
}
