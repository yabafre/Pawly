import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { EquityCounterService } from './equity-counter.service';
import { templateDataSchema } from '@pawly/validators';
import type { TemplateData } from '@pawly/validators';
import type { GenerationResult } from '@pawly/validators';

type SlotRequirement = {
  date: string;
  shiftTypeCode: string;
  startTime: string;
  endTime: string;
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
};

type ConstraintMap = {
  unavailableMap: Map<string, Set<string>>;
  hardRules: Array<{
    id: string;
    name: string;
    category: string;
    config: Record<string, unknown>;
  }>;
  softRules: Array<{
    id: string;
    name: string;
    category: string;
    config: Record<string, unknown>;
  }>;
  equityMap: Map<
    string,
    {
      saturdayCount: number;
      weekendCount: number;
      holidayCount: number;
      overtimeMinutes: number;
    }
  >;
};

@Injectable()
export class PlanningGenerationService {
  private readonly logger = new Logger(PlanningGenerationService.name);
  private static readonly MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
  private static readonly WEEKS_PER_MONTH = 4.33;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicService: ClinicService,
    private readonly planningService: PlanningService,
    private readonly planningTemplateService: PlanningTemplateService,
    private readonly equityCounterService: EquityCounterService,
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
        { startTime: st.startTime, endTime: st.endTime },
      ]),
    );

    const slots = this.expandTemplateToMonth(
      templateData,
      month,
      operationalConfig,
      shiftTypeMap,
    );

    const [year, monthNum] = month.split('-').map(Number);
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

    const assignedShifts: AssignedShift[] = [];
    const assignmentIndex = new Map<string, AssignedShift[]>();
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
        assignedShifts,
        assignmentIndex,
        employeeMinutes,
      );

      assignedShifts.push(...result.assigned);
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

    const createdShifts = await this.prisma.$transaction(async (tx) => {
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
          source: 'GENERATED' as const,
          employeeId: s.employeeId,
          clinicId,
          planningTemplateId: templateId,
        })),
      });
    });

    return this.buildResult(
      createdShifts,
      employees,
      holes,
      hardViolations,
      softViolations,
      totalPositions,
    );
  }

  expandTemplateToMonth(
    template: TemplateData,
    month: string,
    operationalConfig: {
      workDays: string[];
      closedDays: Array<{ date: string }>;
      specialDays: Array<{
        date: string;
        startTime: string;
        endTime: string;
      }>;
    },
    shiftTypeMap: Map<string, { startTime: string; endTime: string }>,
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

        const specialDay = specialDayMap.get(dateStr);
        const startTime = specialDay
          ? specialDay.startTime
          : shiftTimes.startTime;
        const endTime = specialDay
          ? specialDay.endTime
          : shiftTimes.endTime;

        slots.push({
          date: dateStr,
          shiftTypeCode: templateSlot.shiftTypeCode,
          startTime,
          endTime,
          requiredStaff: templateSlot.requiredStaff,
          requiredJobTypes: templateSlot.requiredJobTypes,
        });
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return slots;
  }

  async loadConstraints(
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

    for (const ua of unavailabilities) {
      const empDates =
        unavailableMap.get(ua.employeeId) || new Set<string>();

      const effectiveStart =
        ua.startDate > monthStart ? ua.startDate : monthStart;
      const effectiveEnd =
        ua.endDate < monthEnd ? ua.endDate : monthEnd;

      if (ua.daysOfWeek.length === 0) {
        const cursor = new Date(effectiveStart);
        while (cursor <= effectiveEnd) {
          empDates.add(cursor.toISOString().split('T')[0]);
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      } else {
        const cursor = new Date(effectiveStart);
        while (cursor <= effectiveEnd) {
          const isoDay =
            cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
          if (ua.daysOfWeek.includes(isoDay)) {
            empDates.add(cursor.toISOString().split('T')[0]);
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }

      unavailableMap.set(ua.employeeId, empDates);
    }

    const rules = await this.planningService.listRules(clinicId, {
      isActive: true,
    });
    const hardRules = rules
      .filter((r) => r.ruleType === 'HARD')
      .map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        config: r.config as Record<string, unknown>,
      }));
    const softRules = rules
      .filter((r) => r.ruleType === 'SOFT')
      .map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        config: r.config as Record<string, unknown>,
      }));

    const counters = await this.equityCounterService.getCountersForPeriod(
      clinicId,
      year,
      [month],
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
          existing.saturdayCount = counter.count;
          break;
        case 'WEEKEND_TOTAL':
          existing.weekendCount = counter.count;
          break;
        case 'HOLIDAY_WORKED':
          existing.holidayCount = counter.count;
          break;
        case 'OVERTIME_HOURS':
          existing.overtimeMinutes = counter.count;
          break;
      }

      equityMap.set(counter.employee.id, existing);
    }

    return { unavailableMap, hardRules, softRules, equityMap };
  }

  scoreAndAssign(
    slot: SlotRequirement,
    employees: EmployeeInfo[],
    constraints: ConstraintMap,
    alreadyAssigned: AssignedShift[],
    assignmentIndex: Map<string, AssignedShift[]>,
    employeeMinutes: Map<string, number>,
  ): {
    assigned: AssignedShift[];
    holeInfo?: GenerationResult['holes'][number];
    hardViolations: GenerationResult['violations']['hard'];
    softViolations: GenerationResult['violations']['soft'];
  } {
    const assigned: AssignedShift[] = [];
    const hardViols: GenerationResult['violations']['hard'] = [];
    const softViols: GenerationResult['violations']['soft'] = [];

    // Filter eligible employees
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

      return true;
    });

    // Check HARD rules
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
      // Hard constraint violated — record hole, do NOT fill this slot
      const holeInfo: GenerationResult['holes'][number] = {
        date: slot.date,
        shiftTypeCode: slot.shiftTypeCode,
        requiredStaff: slot.requiredStaff,
        assignedStaff: 0,
        reason: `Hard rule violated: ${hardViols.map(v => v.ruleName).join(', ')}`,
      };
      return { assigned: [], holeInfo, hardViolations: hardViols, softViolations: [] };
    }

    // Score each eligible employee
    const scored = eligible.map((emp) => {
      let score = 100;

      const equity = constraints.equityMap.get(emp.id);
      if (equity) {
        const date = new Date(`${slot.date}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay();
        const isSaturday = dayOfWeek === 6;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        // TODO: Add holiday equity scoring when public holiday calendar is available
        // Currently only Saturday and weekend equity bonuses are applied
        if (isSaturday || isWeekend) {
          const avgEquity = this.getAverageEquity(
            constraints.equityMap,
            isSaturday ? 'saturdayCount' : 'weekendCount',
          );
          const empCount = isSaturday
            ? equity.saturdayCount
            : equity.weekendCount;
          if (empCount < avgEquity) {
            score += 20;
          }
        }
      } else {
        score += 20;
      }

      const currentMinutes = employeeMinutes.get(emp.id) || 0;
      const shiftMinutes = this.calculateShiftMinutes(
        slot.startTime,
        slot.endTime,
      );
      const monthlyLimitMinutes =
        emp.contractHours * 60 * PlanningGenerationService.WEEKS_PER_MONTH;
      if (currentMinutes + shiftMinutes <= monthlyLimitMinutes) {
        score += 10;
      }

      if (slot.requiredJobTypes?.includes(emp.jobType)) {
        score += 15;
      }

      const prevDate = this.getPreviousDate(slot.date);
      const prevKey = `${emp.id}|${prevDate}`;
      const assignedPrevDay = (assignmentIndex.get(prevKey) || []).length > 0;
      if (assignedPrevDay) {
        score -= 10;
      }

      return { employee: emp, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const toAssign = scored.slice(0, slot.requiredStaff);

    for (const { employee } of toAssign) {
      // Check SOFT rule violations for this assignment
      for (const rule of constraints.softRules) {
        if (rule.category === 'ROTATION_EQUITY') {
          this.checkRotationEquity(
            rule,
            slot,
            employee,
            alreadyAssigned,
            softViols,
          );
        }

        if (rule.category === 'CONTRACT_COMPLIANCE') {
          this.checkContractCompliance(
            rule,
            slot,
            employee,
            employeeMinutes,
            softViols,
          );
        }
      }

      assigned.push({
        employeeId: employee.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        shiftTypeCode: slot.shiftTypeCode,
      });

      const shiftMinutes = this.calculateShiftMinutes(
        slot.startTime,
        slot.endTime,
      );
      employeeMinutes.set(
        employee.id,
        (employeeMinutes.get(employee.id) || 0) + shiftMinutes,
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

  async listShiftsForMonth(clinicId: string, month: string) {
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

  private checkRotationEquity(
    rule: { id: string; name: string; category: string; config: Record<string, unknown> },
    slot: SlotRequirement,
    employee: EmployeeInfo,
    alreadyAssigned: AssignedShift[],
    softViols: GenerationResult['violations']['soft'],
  ) {
    const targetDay = rule.config.targetDay as string;
    const maxPerPeriod = rule.config.maxPerPeriod as number;

    const dayNameToIso: Record<string, number> = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sunday: 7,
    };
    const targetIsoDay = dayNameToIso[targetDay];
    if (!targetIsoDay) return;

    const slotDate = new Date(`${slot.date}T00:00:00.000Z`);
    const slotIsoDay =
      slotDate.getUTCDay() === 0 ? 7 : slotDate.getUTCDay();
    if (slotIsoDay !== targetIsoDay) return;

    const count = alreadyAssigned.filter((a) => {
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
        message: `Employee ${employee.firstName} ${employee.lastName} has ${count + 1} ${targetDay} shifts, exceeds maximum of ${maxPerPeriod}`,
        affectedEmployeeId: employee.id,
        affectedDate: slot.date,
        severity: 'warning' as const,
      });
    }
  }

  private checkContractCompliance(
    rule: { id: string; name: string; category: string; config: Record<string, unknown> },
    slot: SlotRequirement,
    employee: EmployeeInfo,
    employeeMinutes: Map<string, number>,
    softViols: GenerationResult['violations']['soft'],
  ) {
    const maxMonthlyHours = rule.config.maxMonthlyHours as
      | number
      | undefined;
    if (!maxMonthlyHours) return;

    const currentMinutes = employeeMinutes.get(employee.id) || 0;
    const shiftMinutes = this.calculateShiftMinutes(
      slot.startTime,
      slot.endTime,
    );
    const totalHours = Math.round((currentMinutes + shiftMinutes) / 60);

    if (totalHours > maxMonthlyHours) {
      softViols.push({
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        message: `Employee ${employee.firstName} ${employee.lastName} total ${totalHours}h exceeds maximum ${maxMonthlyHours}h`,
        affectedEmployeeId: employee.id,
        affectedDate: slot.date,
        severity: 'warning' as const,
      });
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
}
