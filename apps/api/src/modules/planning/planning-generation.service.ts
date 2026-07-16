import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ClinicService } from '@/modules/clinic/clinic.service';
import { MailService } from '@/modules/mail/mail.service';
import { PushNotificationService } from '@/modules/notification/push-notification.service';
import { batchEmailPublishTask, batchPushPublishTask } from '@/trigger/client';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { EquityCounterService } from './equity-counter.service';
import { ApprenticeDeclarationService } from './apprentice-declaration.service';
import { wouldExceedStatutory, type StatutoryShift } from './french-labor-law';
import { restMinutesBetween, shiftsOverlap } from './shift-interval';
import {
  violatesHardContractIncremental,
  violatesHardRotation,
  type RuleType,
} from './rule-engine';
import {
  computeLoads,
  deriveEquityWeights,
  equityObjective,
  findEjectionChain,
  selectImprovingSwap,
  type RepairSlot,
  type RepairAssignment,
} from './local-repair';
import {
  buildSolverModel,
  decodeSolution,
  type SolverInput,
} from './solver-model';
import { SolverEngineService } from './solver-engine.service';
import { templateDataSchema } from '@pawly/validators';
import type { TemplateData } from '@pawly/validators';
import type {
  GenerationResult,
  HardViolation,
  SoftViolation,
  EquitySummaryEntry,
} from '@pawly/validators';
import type {
  ScheduleViewData,
  ScheduleEmployee,
  ScheduleDayInfo,
  ScheduleShift,
  ScheduleUnavailability,
  ScheduleHole,
  MoveValidationResult,
} from '@pawly/validators';
import { planningGenerationDuration } from '@/common/metrics';
import type { CounterWithEmployee } from './equity-counter.service';

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

// Story 11-2 (AC3) — a surviving shift carries its employee's jobType so the
// coverage subtraction can gate on requiredJobTypes exactly like AC1 eligibility.
type SurvivingShift = AssignedShift & { jobType: string | null };

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
  private static readonly SCHOOL_DAY_MINUTES = 420; // 7h — must match SCHOOL_DAY_MINUTES in @pawly/validators
  private static readonly EQUITY_WINDOW_MONTHS = 12; // Story 11-7 — rolling equity window (months before the target)
  // Story 11-9 — local-repair bounds (AC4). Ejection depth is <=3 (KON-128): depth 2 first,
  // depth-3 fallback behind ONE shared evaluation budget for the whole repair pass.
  private static readonly MAX_HILLCLIMB_ITERATIONS = 200;
  private static readonly DEPTH3_PASS_EVALUATION_BUDGET = 4_000;
  // Story 12-1 (KON-129) — CP-SAT deterministic-time budget (deterministic units,
  // never wall-clock: invariant #3). Calibrated on the 50-employee stress model
  // (4,650 vars): 0.05 det ≈ 0.35s wall, keeping the whole cpsat generation inside
  // the NFR2 envelope with real margin. The greedy hint is the solver's incumbent,
  // so a budget-cut solve degrades to "no improvement found" (greedy served) —
  // never to a worse plan. At real clinic scale (5-20 employees, ~10x smaller
  // models) this budget is ample for a proven OPTIMAL.
  private static readonly SOLVER_DETERMINISTIC_BUDGET = 0.05;
  private static readonly REPAIR_YIELD_EVERY = 8; // mirror the generation-loop event-loop yield
  private static readonly DAY_NAME_TO_ISO: Record<string, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicService: ClinicService,
    private readonly mailService: MailService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly planningService: PlanningService,
    private readonly planningTemplateService: PlanningTemplateService,
    private readonly equityCounterService: EquityCounterService,
    private readonly apprenticeDeclarationService: ApprenticeDeclarationService,
    private readonly solverEngine: SolverEngineService,
  ) {}

  // Story 11-5 — the (clinicId, month) advisory lock already serializes same-key
  // runs, and both transactions run at the default READ COMMITTED isolation, so
  // the second waiter's deleteMany takes a fresh per-statement snapshot and sees
  // the first run's committed rows — clearing them before re-creating, no P2002
  // in the happy path. (SERIALIZABLE would freeze the snapshot at the advisory-lock
  // SELECT, before the lock is granted, so the waiter would NOT see the first run's
  // rows — reintroducing the very P2002/retry it is meant to avoid.) A rare
  // deadlock_detected (SQLSTATE 40P01) can still surface as Prisma error code P2034
  // against an unrelated concurrent writer: retry the whole transaction (the lock is
  // re-acquired and the delete+create replays against the now-committed state).
  // Every other error — including P2002 (permanent under the same inputs; retrying
  // would only repeat it) — propagates unchanged so the caller's catch can map it.
  private async withSerializationRetry<T>(
    op: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await op();
      } catch (error: unknown) {
        const code = (error as { code?: string }).code;
        if (code === 'P2034' && attempt < maxAttempts) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  async generateMonthlyPlan(
    clinicId: string,
    month: string,
    templateId: string,
    options: {
      acknowledgePublishedChange?: boolean;
      enableRepair?: boolean;
      engine?: 'greedy' | 'cpsat';
    } = {},
  ): Promise<GenerationResult> {
    const generationStart = Date.now();
    let servedEngine: 'greedy' | 'cpsat' = 'greedy';
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(
        `Invalid month format: ${month}. Expected YYYY-MM`,
      );
    }

    // Story 11-1 — extend the 7-6 published-change guard to bulk regeneration:
    // regenerating a PUBLISHED month must be explicitly acknowledged, mirroring
    // moveShift/createManualShift/deleteShift.
    const publishedMonths = await this.assertPublishedChangeAcknowledged(
      clinicId,
      [month],
      options.acknowledgePublishedChange ?? false,
    );

    const template = await this.planningTemplateService.getTemplateById(
      clinicId,
      templateId,
    );
    const parsed = templateDataSchema.safeParse(template.data);
    if (!parsed.success) {
      throw new BadRequestException(
        `Template data is invalid: ${parsed.error.message}`,
      );
    }
    const templateData = parsed.data;

    const operationalConfig =
      await this.clinicService.getOperationalConfig(clinicId);
    const shiftTypes = await this.clinicService.listShiftTypes(clinicId);

    const shiftTypeMap = new Map(
      shiftTypes.map((st) => [
        st.code,
        {
          startTime: st.startTime,
          endTime: st.endTime,
          breakMinutes: st.breakMinutes,
        },
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
      operationalConfig.workDays
        .map((d: string) => {
          const map: Record<string, number> = {
            MONDAY: 1,
            TUESDAY: 2,
            WEDNESDAY: 3,
            THURSDAY: 4,
            FRIDAY: 5,
            SATURDAY: 6,
            SUNDAY: 7,
            '1': 1,
            '2': 2,
            '3': 3,
            '4': 4,
            '5': 5,
            '6': 6,
            '7': 7,
          };
          return map[d] || 0;
        })
        .filter(Boolean),
    );
    const slotsPreOrdered = this.reorderSlotsNonWorkDaysFirst(
      rawSlots,
      workDaySet,
    );

    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
    const weeksInMonth = daysInMonth / 7;
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

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

    // Story 11-7 — seed a zero-initialised equity entry for every active
    // employee BEFORE any scoring or live increment. This makes
    // getAverageEquity's denominator the whole active workforce (not just
    // employees with history), removes the need for a flat "+20" fallback for
    // un-mapped employees, and — critically — keeps the averages deterministic
    // (invariant #3): they no longer depend on the order in which entries would
    // otherwise be lazily created during the slot loop.
    for (const emp of employees) {
      this.getOrCreateEquityEntry(constraints.equityMap, emp.id);
    }

    // Pre-check: all apprentices must have school day declarations
    const undeclared =
      await this.apprenticeDeclarationService.getUndeclaredApprentices(
        clinicId,
        month,
      );
    if (undeclared.length > 0) {
      const names = undeclared
        .map((a) => `${a.firstName} ${a.lastName}`)
        .join(', ');
      throw new BadRequestException(
        `Cannot generate: apprentice school day declarations missing for ${month}. Undeclared: ${names}`,
      );
    }

    // FIX 1 — MRV heuristic: sort slots by eligible pool size (most constrained first).
    const slots = this.reorderByMRV(slotsPreOrdered, employees, constraints);

    // Load existing shifts from adjacent months for border ISO weeks.
    // This ensures weekly hour calculations are correct when weeks straddle month boundaries.
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

    // allShiftsForScoring includes border + newly assigned (for weekly hour calculation)
    const allShiftsForScoring: AssignedShift[] = [...borderShifts];

    // FIX 4 — O(1) weekly minutes counter: maintained incrementally instead of O(E×A) per slot
    const weeklyMinutesCounter = new Map<string, number>(); // key: `empId|weekStart`
    // Pre-seed from border shifts
    for (const bs of borderShifts) {
      const weekKey = `${bs.employeeId}|${this.getWeekBounds(bs.date).start}`;
      const netMin =
        this.calculateShiftMinutes(bs.startTime, bs.endTime) -
        (bs.breakMinutes || 0);
      weeklyMinutesCounter.set(
        weekKey,
        (weeklyMinutesCounter.get(weekKey) || 0) + netMin,
      );
    }
    // Pre-seed school day minutes into weekly counter
    for (const emp of employees) {
      const schoolDates = constraints.schoolDayMap.get(emp.id);
      if (schoolDates) {
        for (const date of schoolDates) {
          const weekKey = `${emp.id}|${this.getWeekBounds(date).start}`;
          weeklyMinutesCounter.set(
            weekKey,
            (weeklyMinutesCounter.get(weekKey) || 0) +
              PlanningGenerationService.SCHOOL_DAY_MINUTES,
          );
        }
      }
    }

    // FIX 4 — O(1) shift type counter: maintained incrementally
    const shiftTypeCounts = new Map<string, Map<string, number>>(); // empId -> (shiftTypeCode -> count)
    // FIX 4 — O(1) shift count per employee
    const employeeShiftCounts = new Map<string, number>();

    const holes: GenerationResult['holes'] = [];
    const hardViolations: GenerationResult['violations']['hard'] = [];
    const softViolations: GenerationResult['violations']['soft'] = [];
    const employeeMinutes = new Map<string, number>();
    let totalPositions = 0;
    // Story 11-2 (AC3 metric) — positions already filled by a surviving shift are
    // neither a generated row nor a hole; count them so the fill stat is accurate.
    let survivorCoveredPositions = 0;

    // Story 11-2 — seed the in-month surviving shifts into every counter BEFORE
    // the loop so the generator is aware of them. Unlike border shifts (adjacent
    // months → only weekly minutes + overlap matter), survivors are IN this month
    // so they count toward this month's shift/type/equity/monthly-minute load too.
    // Unconditional: 11-1's deleteMany preserves confirmed/variance shifts on
    // DRAFT and PUBLISHED alike, so survivors can exist on any regeneration.
    const survivingShifts = await this.loadSurvivingShiftsInMonth(
      clinicId,
      monthStart,
      monthEnd,
    );
    for (const ss of survivingShifts) {
      const key = `${ss.employeeId}|${ss.date}`;
      const existing = assignmentIndex.get(key) || [];
      existing.push(ss);
      assignmentIndex.set(key, existing);

      allShiftsForScoring.push(ss);

      const netMin =
        this.calculateShiftMinutes(ss.startTime, ss.endTime) -
        (ss.breakMinutes || 0);
      const weekKey = `${ss.employeeId}|${this.getWeekBounds(ss.date).start}`;
      weeklyMinutesCounter.set(
        weekKey,
        (weeklyMinutesCounter.get(weekKey) || 0) + netMin,
      );

      let typeCounts = shiftTypeCounts.get(ss.employeeId);
      if (!typeCounts) {
        typeCounts = new Map();
        shiftTypeCounts.set(ss.employeeId, typeCounts);
      }
      typeCounts.set(
        ss.shiftTypeCode,
        (typeCounts.get(ss.shiftTypeCode) || 0) + 1,
      );

      employeeShiftCounts.set(
        ss.employeeId,
        (employeeShiftCounts.get(ss.employeeId) || 0) + 1,
      );

      employeeMinutes.set(
        ss.employeeId,
        (employeeMinutes.get(ss.employeeId) || 0) + netMin,
      );

      const date = new Date(`${ss.date}T00:00:00.000Z`);
      const dayOfWeek = date.getUTCDay();
      // Story 11-7 — create the entry if absent (e.g. an inactive-employee
      // survivor not seeded above) so its weekend load is reflected in scoring.
      const equity = this.getOrCreateEquityEntry(
        constraints.equityMap,
        ss.employeeId,
      );
      if (dayOfWeek === 6) equity.saturdayCount++;
      if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
      // Story 11-10 — survivors are in allShiftsForScoring; seed the rotation index.
      this.incrementDayOfWeekCount(dayOfWeekCounts, ss.employeeId, ss.date);
    }

    // Story 11-2 (AC3) — index the pre-existing surviving coverage per slot key
    // (date|shiftTypeCode). Each entry keeps the survivor's real time window +
    // jobType so the loop can credit coverage ONLY for a survivor that genuinely
    // overlaps the slot's live-resolved hours AND satisfies its requiredJobTypes
    // — the same gates as AC1 eligibility. Keying on shiftTypeCode alone would let
    // a stale-hours survivor (e.g. shift-type hours edited, or a moved shift whose
    // frozen times no longer match) or a wrong-jobType survivor silently mask a
    // real staffing gap with no hole (aped-review BLOCKER).
    const preExistingSlotCoverage = new Map<
      string,
      Array<{
        startTime: string;
        endTime: string;
        jobType: string | null;
        consumed: boolean;
      }>
    >();
    for (const ss of survivingShifts) {
      const coverageKey = `${ss.date}|${ss.shiftTypeCode}`;
      const bucket = preExistingSlotCoverage.get(coverageKey) || [];
      bucket.push({
        startTime: ss.startTime,
        endTime: ss.endTime,
        jobType: ss.jobType,
        consumed: false,
      });
      preExistingSlotCoverage.set(coverageKey, bucket);
    }

    // Story 11-10 — quarterly history is fixed for the whole run; index it once
    // (was spread + filtered on every quarterly rotation check, per emp per slot).
    const quarterlyDayOfWeekCounts = this.buildDayOfWeekIndex(
      constraints.quarterlyShifts,
    );

    // Story 12-1 (KON-129) — freeze the pre-greedy fixed baseline (border +
    // survivors + school) so the solver's model re-decides GENERATED assignments
    // only. Captured ONLY on the cpsat path: the default engine pays nothing.
    const solverBaseline =
      options.engine === 'cpsat'
        ? {
            weeklyMinutes: new Map(weeklyMinutesCounter),
            fixedShiftsByEmployee: (() => {
              const byEmp = new Map<string, AssignedShift[]>();
              for (const bucket of assignmentIndex.values()) {
                for (const s of bucket) {
                  if (!byEmp.has(s.employeeId)) byEmp.set(s.employeeId, []);
                  byEmp.get(s.employeeId)!.push(s);
                }
              }
              return byEmp;
            })(),
            rotationCounts: new Map(
              [...dayOfWeekCounts.entries()].map(([k, v]) => [k, new Map(v)]),
            ),
          }
        : null;

    // Story 11-10 (AC2 fallback) — yield to the event loop every 8 slots so a
    // month-long generation never blocks concurrent API requests for its whole
    // duration. Deterministic: the yield does not reorder slot processing.
    let slotsSinceYield = 0;
    for (const slot of slots) {
      if (++slotsSinceYield % 8 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      totalPositions += slot.requiredStaff;

      // Story 11-2 (AC3) — reduce the requirement by pre-existing coverage, but
      // count a survivor only when it actually overlaps this slot's resolved hours
      // and satisfies its requiredJobTypes. Each survivor is consumed at most once
      // (marked below), so slots sharing a (date,shiftType) key never double-claim
      // it. Skip fully-covered slots entirely (no generation, no false hole).
      // scoreAndAssign receives a slot clone whose requiredStaff is the residual,
      // so its slice + hole logic stay correct.
      const coverageKey = `${slot.date}|${slot.shiftTypeCode}`;
      const coverageBucket = preExistingSlotCoverage.get(coverageKey) || [];
      let preCovered = 0;
      for (const cov of coverageBucket) {
        if (cov.consumed) continue;
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
        if (
          slot.requiredJobTypes &&
          slot.requiredJobTypes.length > 0 &&
          (cov.jobType === null || !slot.requiredJobTypes.includes(cov.jobType))
        ) {
          continue;
        }
        cov.consumed = true;
        preCovered++;
        if (preCovered >= slot.requiredStaff) break;
      }
      const effectiveRequiredStaff = Math.max(
        0,
        slot.requiredStaff - preCovered,
      );
      survivorCoveredPositions += preCovered;
      if (effectiveRequiredStaff === 0) continue;

      const result = this.scoreAndAssign(
        { ...slot, requiredStaff: effectiveRequiredStaff },
        employees,
        constraints,
        allShiftsForScoring,
        assignmentIndex,
        employeeMinutes,
        weeksInMonth,
        weeklyMinutesCounter,
        shiftTypeCounts,
        employeeShiftCounts,
        dayOfWeekCounts,
        quarterlyDayOfWeekCounts,
      );

      assignedShifts.push(...result.assigned);
      allShiftsForScoring.push(...result.assigned);
      for (const a of result.assigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);

        // FIX 4 — Update incremental counters
        const netMin =
          this.calculateShiftMinutes(a.startTime, a.endTime) -
          (a.breakMinutes || 0);
        const weekKey = `${a.employeeId}|${this.getWeekBounds(a.date).start}`;
        weeklyMinutesCounter.set(
          weekKey,
          (weeklyMinutesCounter.get(weekKey) || 0) + netMin,
        );

        // Update shift type counts
        let typeCounts = shiftTypeCounts.get(a.employeeId);
        if (!typeCounts) {
          typeCounts = new Map();
          shiftTypeCounts.set(a.employeeId, typeCounts);
        }
        typeCounts.set(
          a.shiftTypeCode,
          (typeCounts.get(a.shiftTypeCode) || 0) + 1,
        );

        // Update employee shift count
        employeeShiftCounts.set(
          a.employeeId,
          (employeeShiftCounts.get(a.employeeId) || 0) + 1,
        );

        // FIX 3 — Update equity counters during generation
        // Story 11-7 — create the entry if absent so subsequent slots score
        // against this employee's real, updated load.
        const date = new Date(`${a.date}T00:00:00.000Z`);
        const dayOfWeek = date.getUTCDay();
        const equity = this.getOrCreateEquityEntry(
          constraints.equityMap,
          a.employeeId,
        );
        if (dayOfWeek === 6) equity.saturdayCount++;
        if (dayOfWeek === 0 || dayOfWeek === 6) equity.weekendCount++;
        // Story 11-10 — keep the rotation index in lockstep with allShiftsForScoring.
        this.incrementDayOfWeekCount(dayOfWeekCounts, a.employeeId, a.date);
      }
      if (result.holeInfo) holes.push(result.holeInfo);
      hardViolations.push(...result.hardViolations);
      softViolations.push(...result.softViolations);
    }

    // Story 11-9 — bounded GRASP local-repair pass. Runs on the fully-populated in-memory
    // counters, before persistence, so it can move GENERATED assignments the single greedy pass
    // could not. Mutates assignedShifts + every counter in lockstep; recomputes holes after.
    // `enableRepair` is an internal test seam (defaults ON) so a fixture can measure the greedy-only
    // baseline against the repaired result — the both-ways proof AC1/AC2 rely on. It is NOT forwarded
    // by the tRPC generate route (planning.router.ts), so no external caller can disable the pass.
    if (options.enableRepair ?? true) {
      const repairedHoles = await this.runLocalRepairPass({
        employees,
        slots,
        constraints,
        assignedShifts,
        allShiftsForScoring,
        assignmentIndex,
        weeklyMinutesCounter,
        employeeMinutes,
        shiftTypeCounts,
        employeeShiftCounts,
        dayOfWeekCounts,
        quarterlyDayOfWeekCounts,
        preExistingSlotCoverage,
        priorHoles: holes,
      });
      holes.length = 0;
      holes.push(...repairedHoles);
    }

    // Story 12-1 (KON-129) — opt-in CP-SAT improve pass. Greedy(+repair) already
    // ran and is the guaranteed baseline: its plan seeds the solver as a hint, and
    // the solver plan is served ONLY when strictly better (fill, then the exact
    // weighted equity objective) AND fully re-validated by replaying it through
    // evaluateEligibility on the live counters. Never degrades, never silent (NFR3).
    if (options.engine === 'cpsat' && solverBaseline) {
      const solverStart = Date.now();
      try {
        const improvedHoles = await this.runSolverImprovePass({
          employees,
          slots,
          constraints,
          assignedShifts,
          allShiftsForScoring,
          assignmentIndex,
          weeklyMinutesCounter,
          employeeMinutes,
          shiftTypeCounts,
          employeeShiftCounts,
          dayOfWeekCounts,
          quarterlyDayOfWeekCounts,
          preExistingSlotCoverage,
          priorHoles: holes,
          baseline: solverBaseline,
        });
        if (improvedHoles) {
          holes.length = 0;
          holes.push(...improvedHoles);
          servedEngine = 'cpsat';
        }
      } catch (error) {
        this.logger.warn(
          `KON-129 solver pass failed after ${Date.now() - solverStart}ms — serving the greedy plan: ${String(error)}`,
        );
      }
    }

    // Story 11-1 — collect the employees whose GENERATED shifts are about to be
    // cleared, so they can be notified (union with the new assignees below).
    // Confirmed shifts and shifts carrying clock-in / no-show history
    // (VarianceEvent) are preserved and never counted here.
    let deletedEmployeeIds: string[] = [];
    if (publishedMonths.length > 0) {
      const toDelete = await this.prisma.shift.findMany({
        where: {
          clinicId,
          source: 'GENERATED',
          isConfirmed: false,
          varianceEvents: { none: {} },
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true },
        distinct: ['employeeId'],
      });
      deletedEmployeeIds = toDelete.map((s) => s.employeeId);
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
      createdShifts = await this.withSerializationRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            // Story 11-5 — serialize concurrent generations of the SAME
            // (clinic, month) so a retry (reverse-proxy 502/504 replay, or a
            // double-click) can never interleave two delete+create passes into a
            // duplicated month. pg_advisory_xact_lock auto-releases at COMMIT /
            // ROLLBACK on this interactive transaction's pinned connection (safe
            // with the Prisma pool, unlike a session-level pg_advisory_lock). Two
            // int4 keys — hashtext of each — avoid the bigint-cast ambiguity of the
            // single-argument form; the tagged template binds them as parameters.
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
          },
          {
            timeout: 15000,
          },
        ),
      );
    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError.code === 'P2002') {
        throw new ConflictException(
          'Duplicate shift detected during generation',
        );
      }
      this.logger.error('Transaction failed during shift generation', error);
      throw new InternalServerErrorException(
        'Failed to persist generated shifts',
      );
    }

    // Story 11-1 — a regeneration of a PUBLISHED month is an amendment: bump
    // amendedAt/amendmentCount and notify every affected employee (those whose
    // shifts were cleared UNION the freshly generated assignees). Mirrors the
    // moveShift path; notification failures are logged, never block generation.
    if (publishedMonths.length > 0) {
      const recipientIds = [
        ...new Set([
          ...deletedEmployeeIds,
          ...createdShifts.map((s) => s.employeeId),
        ]),
      ];
      await this.recordAmendment(this.prisma, clinicId, publishedMonths);
      this.notifyScheduleChange(
        clinicId,
        recipientIds.map((employeeId) => ({ employeeId, month })),
      ).catch((err: Error) =>
        this.logger.error(`Notify schedule-change failed: ${err.message}`),
      );
    }

    planningGenerationDuration.record(Date.now() - generationStart, {
      clinic_id: clinicId,
      shift_count: String(createdShifts.length),
    });

    return this.buildResult(
      createdShifts,
      employees,
      holes,
      hardViolations,
      softViolations,
      totalPositions,
      survivorCoveredPositions,
      servedEngine,
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
    shiftTypeMap: Map<
      string,
      { startTime: string; endTime: string; breakMinutes: number }
    >,
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

    const templateDayNumbers = new Set(template.days.map((d) => d.dayOfWeek));

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

      const templateDay = template.days.find((d) => d.dayOfWeek === isoDay);
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
          this.windowsOverlap(
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
      const empDates = unavailableMap.get(ua.employeeId) || new Set<string>();
      const isSchool = ua.type === 'SCHOOL';
      const schoolDates = isSchool
        ? schoolDayMap.get(ua.employeeId) || new Set<string>()
        : null;

      const effectiveStart =
        ua.startDate > monthStart ? ua.startDate : monthStart;
      const effectiveEnd = ua.endDate < monthEnd ? ua.endDate : monthEnd;

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
          const isoDay = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
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
    const mapRule = (r: {
      id: string;
      name: string;
      category: string;
      config: unknown;
      priority: number;
    }): RuleEntry => ({
      id: r.id,
      name: r.name,
      category: r.category,
      config: r.config as Record<string, unknown>,
      priority: r.priority,
    });
    const hardRules = rules.filter((r) => r.ruleType === 'HARD').map(mapRule);
    const softRules = rules.filter((r) => r.ruleType === 'SOFT').map(mapRule);

    // Story 11-7 — cumulative equity over a rolling 12-month window ending the
    // month BEFORE the target (excludes the current month to avoid circular
    // scoring). Unlike the old current-calendar-year query, this crosses the
    // year boundary, so a January generation still sees December N-1 and equity
    // never resets on 1 January.
    const counters = await this.equityCounterService.getCountersForWindow(
      clinicId,
      year,
      month,
      PlanningGenerationService.EQUITY_WINDOW_MONTHS,
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
      (r) =>
        r.category === 'ROTATION_EQUITY' &&
        r.config.trackingPeriod === 'quarterly',
    );

    let quarterlyShifts: AssignedShift[] = [];
    if (needsQuarterly) {
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      const otherMonths = [
        quarterStartMonth,
        quarterStartMonth + 1,
        quarterStartMonth + 2,
      ].filter((m) => m !== month && m >= 1 && m <= 12);

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

    return {
      unavailableMap,
      schoolDayMap,
      hardRules,
      softRules,
      equityMap,
      quarterlyShifts,
    };
  }

  /**
   * Story 11-9 — the single per-employee eligibility predicate, shared by scoreAndAssign's
   * greedy filter and the local-repair pass. Mirrors the non-disableable HARD checks exactly:
   * unavailability, time overlap, requiredJobTypes, HARD CONTRACT_COMPLIANCE (weekly/monthly via
   * the unified rule engine) + minRestHoursBetweenShifts, French statutory limits, and HARD
   * ROTATION_EQUITY. `blockedOnlyByRotation` is true iff every other check passed and only the
   * rotation cap failed — scoreAndAssign uses it to feed its relaxation fallback; the repair pass
   * ignores it (rotation breach = ineligible, no relaxation). Evaluated on current live state.
   */
  private evaluateEligibility(
    emp: EmployeeInfo,
    slot: SlotRequirement,
    ctx: {
      constraints: ConstraintMap;
      assignmentIndex: Map<string, AssignedShift[]>;
      weeklyMinutesCounter: Map<string, number>;
      employeeMinutes: Map<string, number>;
      dayOfWeekCounts: Map<string, Map<number, number>>;
      quarterlyDayOfWeekCounts: Map<string, Map<number, number>>;
    },
  ): { eligible: boolean; blockedOnlyByRotation: boolean } {
    const slotMinutes =
      this.calculateShiftMinutes(slot.startTime, slot.endTime) -
      (slot.breakMinutes || 0);
    const weekBounds = this.getWeekBounds(slot.date);

    // 1) Unavailability
    const unavailDates = ctx.constraints.unavailableMap.get(emp.id);
    if (unavailDates?.has(slot.date))
      return { eligible: false, blockedOnlyByRotation: false };

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

    // 3) Required job type
    if (
      slot.requiredJobTypes &&
      slot.requiredJobTypes.length > 0 &&
      !slot.requiredJobTypes.includes(emp.jobType)
    ) {
      return { eligible: false, blockedOnlyByRotation: false };
    }

    // 4) HARD CONTRACT_COMPLIANCE (weekly + monthly via the unified engine) + minRest
    const weekMinutes =
      ctx.weeklyMinutesCounter.get(`${emp.id}|${weekBounds.start}`) || 0;
    const hardContractRules = ctx.constraints.hardRules.filter(
      (r) => r.category === 'CONTRACT_COMPLIANCE',
    );
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
            weekMinutes,
            monthMinutes: ctx.employeeMinutes.get(emp.id) || 0,
            candidateMinutes: slotMinutes,
            contractHours: emp.contractHours,
          },
        )
      ) {
        return { eligible: false, blockedOnlyByRotation: false };
      }

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
    }

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

    // 6) HARD ROTATION_EQUITY — the ONLY check that feeds the relaxation fallback
    for (const rule of ctx.constraints.hardRules) {
      if (rule.category === 'ROTATION_EQUITY') {
        if (
          this.violatesHardRotationEquity(
            rule,
            slot,
            emp,
            ctx.dayOfWeekCounts,
            ctx.quarterlyDayOfWeekCounts,
          )
        ) {
          return { eligible: false, blockedOnlyByRotation: true };
        }
      }
    }

    return { eligible: true, blockedOnlyByRotation: false };
  }

  private scoreAndAssign(
    slot: SlotRequirement,
    employees: EmployeeInfo[],
    constraints: ConstraintMap,
    alreadyAssigned: AssignedShift[],
    assignmentIndex: Map<string, AssignedShift[]>,
    employeeMinutes: Map<string, number>,
    weeksInMonth: number,
    weeklyMinutesCounter: Map<string, number>,
    shiftTypeCounts: Map<string, Map<string, number>>,
    employeeShiftCountsMap: Map<string, number>,
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
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
    const slotMinutes =
      this.calculateShiftMinutes(slot.startTime, slot.endTime) -
      (slot.breakMinutes || 0);
    const weekBounds = this.getWeekBounds(slot.date);

    // FIX 4 — O(1) weekly minutes lookup from incremental counter
    const weeklyMinutesMap = new Map<string, number>();
    for (const emp of employees) {
      const weekKey = `${emp.id}|${weekBounds.start}`;
      weeklyMinutesMap.set(emp.id, weeklyMinutesCounter.get(weekKey) || 0);
    }

    // FIX 4 — Use pre-maintained shift type counts (O(1) lookup)
    const employeeShiftTypeCounts = shiftTypeCounts;

    // Filter eligible employees — track rotation-equity-blocked separately for fallback.
    // Story 11-9 — eligibility is the shared evaluateEligibility predicate (also used by the
    // local-repair pass). Behaviour is unchanged: an employee blocked only by HARD ROTATION_EQUITY
    // is bucketed for the relaxation fallback below; any other HARD breach eliminates them.
    const rotationEquityBlocked: EmployeeInfo[] = [];
    const eligibilityCtx = {
      constraints,
      assignmentIndex,
      weeklyMinutesCounter,
      employeeMinutes,
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
    };
    const eligible = employees.filter((emp) => {
      const verdict = this.evaluateEligibility(emp, slot, eligibilityCtx);
      if (!verdict.eligible && verdict.blockedOnlyByRotation) {
        rotationEquityBlocked.push(emp);
      }
      return verdict.eligible;
    });

    // Fallback: if not enough eligible employees but some were only blocked by
    // ROTATION_EQUITY (and NOT by contract compliance), re-admit them to avoid leaving
    // the slot empty. Better to slightly exceed rotation limits than create holes.
    if (
      eligible.length < slot.requiredStaff &&
      rotationEquityBlocked.length > 0
    ) {
      eligible.push(...rotationEquityBlocked);
      for (const emp of rotationEquityBlocked) {
        softViols.push({
          ruleId:
            constraints.hardRules.find((r) => r.category === 'ROTATION_EQUITY')
              ?.id || '00000000-0000-0000-0000-000000000000',
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

    // FIX 2 — Partial fill: when hard rules fire, still assign available employees
    // instead of leaving the slot completely empty. Record a hole for the shortfall.
    if (hardViols.length > 0 && eligible.length === 0) {
      const holeInfo: GenerationResult['holes'][number] = {
        date: slot.date,
        shiftTypeCode: slot.shiftTypeCode,
        requiredStaff: slot.requiredStaff,
        assignedStaff: 0,
        reason: `Hard rule violated: ${hardViols.map((v) => v.ruleName).join(', ')}`,
      };
      return {
        assigned: [],
        holeInfo,
        hardViolations: hardViols,
        softViolations: [],
      };
    }
    // If we have hard violations but some eligible employees, proceed with partial fill.
    // The hole will be recorded later with assignedStaff < requiredStaff.

    // FIX 4 — O(1) shift count lookup from incremental counter
    const employeeShiftCounts = employeeShiftCountsMap;
    const eligibleShiftCounts = eligible.map(
      (e) => employeeShiftCounts.get(e.id) || 0,
    );
    const avgShifts =
      eligibleShiftCounts.length > 0
        ? eligibleShiftCounts.reduce((sum, c) => sum + c, 0) /
          eligibleShiftCounts.length
        : 0;

    // Global weekly cap from CONTRACT_COMPLIANCE rules (if any)
    const allContractRules = [
      ...constraints.hardRules.filter(
        (r) => r.category === 'CONTRACT_COMPLIANCE',
      ),
      ...constraints.softRules.filter(
        (r) => r.category === 'CONTRACT_COMPLIANCE',
      ),
    ];
    const ruleWeeklyCap = allContractRules
      .map((r) => r.config.maxWeeklyHours as number | undefined)
      .find((v) => v !== undefined);

    // Score each eligible employee
    const scored = eligible.map((emp) => {
      let score = 100;

      // Full equity scoring (weekend, holiday, overtime).
      // Story 11-7 — every active employee is seeded up front and both live
      // increments create-if-absent, so getOrCreateEquityEntry always returns a
      // real entry: the former `if (equity) … else { score += 20; }` guard is
      // gone. An un-mapped new hire no longer gets a flat bonus that made them
      // absorb the unpopular weekend / holiday slots.
      const equity = this.getOrCreateEquityEntry(constraints.equityMap, emp.id);
      const date = new Date(`${slot.date}T00:00:00.000Z`);
      const dayOfWeek = date.getUTCDay();
      const isSaturday = dayOfWeek === 6;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (isWeekend) {
        const avgWeekend = this.getAverageEquity(
          constraints.equityMap,
          'weekendCount',
        );
        if (equity.weekendCount < avgWeekend) score += 10;

        if (isSaturday) {
          const avgSaturday = this.getAverageEquity(
            constraints.equityMap,
            'saturdayCount',
          );
          if (equity.saturdayCount < avgSaturday) score += 10;
        }
      }

      // Holiday equity — prefer employees with fewer holiday shifts
      const avgHoliday = this.getAverageEquity(
        constraints.equityMap,
        'holidayCount',
      );
      if (equity.holidayCount < avgHoliday) {
        score += 5;
      } else if (equity.holidayCount > avgHoliday + 1) {
        score -= 5;
      }

      // Overtime equity — penalize employees with more historical overtime
      const avgOvertime = this.getAverageOvertimeMinutes(constraints.equityMap);
      if (equity.overtimeMinutes > avgOvertime) {
        score -= Math.round(((equity.overtimeMinutes - avgOvertime) / 60) * 5);
      }

      // Monthly contract fit bonus
      const currentMinutes = employeeMinutes.get(emp.id) || 0;
      const monthlyLimitMinutes = emp.contractHours * 60 * weeksInMonth;
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
        const remainingRatio =
          (weeklyLimitMin - projectedWeekMin) / weeklyLimitMin;
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
      while (
        consecutiveDays < 6 &&
        (assignmentIndex.get(`${emp.id}|${checkDate}`) || []).length > 0
      ) {
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
      if (prevDayShifts.some((s) => s.shiftTypeCode === slot.shiftTypeCode)) {
        score -= 20;
      }

      // Soft rule scoring adjustments weighted by priority
      for (const rule of constraints.softRules) {
        const priorityWeight = 1 + rule.priority / 10;

        if (rule.category === 'ROTATION_EQUITY') {
          const applicableJT = rule.config.applicableJobTypes as
            | string[]
            | undefined;
          if (
            !applicableJT ||
            applicableJT.length === 0 ||
            applicableJT.includes(emp.jobType)
          ) {
            const count = this.countTargetDayShifts(
              rule,
              emp,
              dayOfWeekCounts,
              quarterlyDayOfWeekCounts,
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
          if (maxMonthly && currentMinutes + slotMinutes > maxMonthly * 60) {
            const overHours =
              (currentMinutes + slotMinutes - maxMonthly * 60) / 60;
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
            const a = group[i],
              b = group[j];
            if (!pairingCounts.has(a)) pairingCounts.set(a, new Map());
            if (!pairingCounts.has(b)) pairingCounts.set(b, new Map());
            pairingCounts
              .get(a)!
              .set(b, (pairingCounts.get(a)!.get(b) || 0) + 1);
            pairingCounts
              .get(b)!
              .set(a, (pairingCounts.get(b)!.get(a) || 0) + 1);
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

      for (
        let pick = 1;
        pick < slot.requiredStaff && remaining.length > 0;
        pick++
      ) {
        // Apply pairing penalty to remaining candidates
        for (const candidate of remaining) {
          let pairingPenalty = 0;
          for (const selected of toAssign) {
            const count =
              pairingCounts
                .get(candidate.employee.id)
                ?.get(selected.employee.id) || 0;
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
            rule,
            slot,
            employee,
            dayOfWeekCounts,
            quarterlyDayOfWeekCounts,
            softViols,
          );
        }

        if (rule.category === 'CONTRACT_COMPLIANCE') {
          this.checkContractCompliance(
            rule,
            slot,
            employee,
            employeeMinutes,
            weeklyMinutesMap,
            softViols,
          );
        }

        // SOFT STAFFING_MINIMUM warning
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

        // SOFT SKILL_REQUIREMENT warning
        if (
          rule.category === 'SKILL_REQUIREMENT' &&
          rule.config.shiftTypeCode === slot.shiftTypeCode
        ) {
          const requiredJobTypes = rule.config.requiredJobTypes as string[];
          const assignedJobTypes = new Set([
            ...toAssign.map((t) => t.employee.jobType),
            ...assigned.map((a) => {
              const e = employees.find((emp) => emp.id === a.employeeId);
              return e?.jobType || '';
            }),
          ]);
          const missing = requiredJobTypes.filter(
            (jt) => !assignedJobTypes.has(jt),
          );
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

      const netMinutes =
        this.calculateShiftMinutes(slot.startTime, slot.endTime) -
        (slot.breakMinutes || 0);
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

    return {
      assigned,
      holeInfo,
      hardViolations: hardViols,
      softViolations: softViols,
    };
  }

  async deleteGeneratedShifts(
    clinicId: string,
    month: string,
    options: { acknowledgePublishedChange?: boolean } = {},
  ): Promise<{ deletedCount: number }> {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(
        `Invalid month format: ${month}. Expected YYYY-MM`,
      );
    }

    // Story 11-1 — purging a PUBLISHED month must be acknowledged (7-6 guard).
    const publishedMonths = await this.assertPublishedChangeAcknowledged(
      clinicId,
      [month],
      options.acknowledgePublishedChange ?? false,
    );

    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    // Story 11-1 — capture affected employees BEFORE deletion so we can notify
    // them. Confirmed shifts and shifts carrying variance history are preserved.
    let deletedEmployeeIds: string[] = [];
    if (publishedMonths.length > 0) {
      const toDelete = await this.prisma.shift.findMany({
        where: {
          clinicId,
          source: 'GENERATED',
          isConfirmed: false,
          varianceEvents: { none: {} },
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { employeeId: true },
        distinct: ['employeeId'],
      });
      deletedEmployeeIds = toDelete.map((s) => s.employeeId);
    }

    // Story 11-1 — preserve confirmed shifts and shifts carrying variance
    // history; only these unconfirmed, history-free GENERATED shifts are purged.
    const { count } = await this.prisma.shift.deleteMany({
      where: {
        clinicId,
        source: 'GENERATED',
        isConfirmed: false,
        varianceEvents: { none: {} },
        date: { gte: monthStart, lte: monthEnd },
      },
    });

    // Story 11-1 — a purge of a PUBLISHED month is an amendment: record it and
    // notify affected employees. Notification failures are logged, never block.
    if (publishedMonths.length > 0) {
      await this.recordAmendment(this.prisma, clinicId, publishedMonths);
      this.notifyScheduleChange(
        clinicId,
        deletedEmployeeIds.map((employeeId) => ({ employeeId, month })),
      ).catch((err: Error) =>
        this.logger.error(`Notify schedule-change failed: ${err.message}`),
      );
    }

    return { deletedCount: count };
  }

  async listShiftsForMonth(
    clinicId: string,
    month: string,
  ): Promise<
    Array<{
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
    }>
  > {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(
        `Invalid month format: ${month}. Expected YYYY-MM`,
      );
    }

    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

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
      throw new BadRequestException(
        `Invalid month format: ${month}. Expected YYYY-MM`,
      );
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
      equityCounters,
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
      this.equityCounterService
        .getCountersForPeriod(clinicId, year, [monthNum])
        .catch(() => {
          this.logger.warn('Failed to fetch equity counters for schedule view');
          return [] as CounterWithEmployee[];
        }),
    ]);

    // Build work day set from ClinicConfig.workDays (e.g., ["MONDAY", "TUESDAY", ...])
    const dayNameToIso: Record<string, number> = {
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 7,
    };
    const workDaySet = new Set(
      operationalConfig.workDays
        .map((d: string) => dayNameToIso[d])
        .filter(Boolean),
    );

    // Build closed day and special day maps
    const closedDateSet = new Set(
      operationalConfig.closedDays.map((cd: { date: string }) => cd.date),
    );
    const specialDayMap = new Map(
      operationalConfig.specialDays.map(
        (sd: { date: string; label?: string | null }) => [
          sd.date,
          sd.label || undefined,
        ],
      ),
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
    const shiftTypeColorMap = new Map(
      shiftTypes.map((st) => [st.code, st.color]),
    );
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
      const effectiveStart =
        ua.startDate > monthStart ? ua.startDate : monthStart;
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
    const templateId = shifts.find(
      (s) => s.source === 'GENERATED' && s.planningTemplateId,
    )?.planningTemplateId;

    // Parallelize template fetch + validation rules (with equity counters for enrichment)
    const [template, validationResult] = await Promise.all([
      templateId
        ? this.planningTemplateService
            .getTemplateById(clinicId, templateId)
            .catch(() => {
              this.logger.warn(
                `Template ${templateId} not found for hole detection`,
              );
              return null;
            })
        : Promise.resolve(null),
      this.planningService
        .validateShiftsAgainstRules(
          clinicId,
          {
            startDate: monthStart.toISOString(),
            endDate: monthEnd.toISOString(),
          },
          {
            equityCounters:
              equityCounters.length > 0 ? equityCounters : undefined,
          },
        )
        .catch(() => {
          this.logger.warn('Failed to validate shifts against rules');
          return {
            hardViolations: [] as HardViolation[],
            softViolations: [] as SoftViolation[],
            rules: [] as Array<{
              id: string;
              name: string;
              category: string;
              ruleType: string;
              config: unknown;
              priority: number;
            }>,
          };
        }),
    ]);

    // Compute holes from template if available
    if (template) {
      const parsed = templateDataSchema.safeParse(template.data);
      if (parsed.success) {
        const shiftTypeMap = new Map(
          shiftTypes.map((st) => [
            st.code,
            {
              startTime: st.startTime,
              endTime: st.endTime,
              breakMinutes: st.breakMinutes,
            },
          ]),
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

    // Build equity summary per employee from equity counters (reuse rules from validation)
    const equitySummary = this.buildEquitySummary(
      equityCounters,
      validationResult.rules,
    );

    return {
      month,
      employees: scheduleEmployees,
      days,
      shifts: scheduleShifts,
      unavailabilities: expandedUnavailabilities,
      holes,
      violations,
      equitySummary: equitySummary.length > 0 ? equitySummary : undefined,
      templateId: templateId ?? undefined,
    };
  }

  // ── Shift mutation methods (Story 7.1: Manual Schedule Adjustment) ──────

  /**
   * Story 7.6 — post-publication guard. Returns the subset of `months`
   * that are PUBLISHED. Throws when at least one is published and the
   * caller has not acknowledged the change (structured code, mapped to a
   * translated message in the web layer — never English prose).
   */
  private async assertPublishedChangeAcknowledged(
    clinicId: string,
    months: string[],
    acknowledged: boolean,
  ): Promise<string[]> {
    const unique = [...new Set(months)];
    const published = await this.prisma.planningPeriodStatus.findMany({
      where: { clinicId, month: { in: unique }, status: 'PUBLISHED' },
      select: { month: true },
    });
    const publishedMonths = published.map((p) => p.month);
    if (publishedMonths.length > 0 && !acknowledged) {
      throw new ConflictException('PUBLISHED_CHANGE_REQUIRES_ACK');
    }
    return publishedMonths;
  }

  // Story 11-6 — accepts the active transaction client (or `this.prisma`) so
  // the amendment bookkeeping commits atomically with the shift mutation.
  private async recordAmendment(
    tx: Prisma.TransactionClient,
    clinicId: string,
    months: string[],
  ): Promise<void> {
    if (months.length === 0) return;
    await tx.planningPeriodStatus.updateMany({
      where: { clinicId, month: { in: months }, status: 'PUBLISHED' },
      data: { amendedAt: new Date(), amendmentCount: { increment: 1 } },
    });
  }

  /**
   * Notifies each (employee, month) pair once — email + push. Ignores the
   * notifyOnPublish preference on purpose: missing a post-publication
   * change means a missed shift (decision locked in story 7.6).
   */
  private async notifyScheduleChange(
    clinicId: string,
    recipients: Array<{ employeeId: string; month: string }>,
  ): Promise<void> {
    const seen = new Set<string>();
    const unique = recipients.filter((r) => {
      const key = `${r.employeeId}|${r.month}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length === 0) return;

    const [employees, clinic] = await Promise.all([
      // Story 7.6 — do NOT filter on email here: an active employee without an
      // email must still receive the push notification (AC3). The email loop
      // below skips null-email employees individually.
      this.prisma.employee.findMany({
        where: {
          id: { in: unique.map((r) => r.employeeId) },
          clinicId,
          isActive: true,
        },
        select: {
          id: true,
          firstName: true,
          email: true,
          user: { select: { locale: true } },
        },
      }),
      this.prisma.clinic.findUniqueOrThrow({
        where: { id: clinicId },
        select: { name: true },
      }),
    ]);
    const byId = new Map(employees.map((e) => [e.id, e]));

    let attemptedEmailCount = 0;
    let failedEmailCount = 0;
    for (const r of unique) {
      const emp = byId.get(r.employeeId);
      if (!emp || !emp.email) continue;
      attemptedEmailCount++;
      // Story 11-4 (AC2) — react to the returned status. sendScheduleChangedEmail
      // now returns false (not throws) when both channels fail, so a change
      // notification outage is visible in the logs (NFR3) instead of silently
      // dropped, and one bad recipient never aborts the loop.
      const ok = await this.mailService.sendScheduleChangedEmail(
        emp.email,
        emp.firstName,
        r.month,
        clinic.name,
        (emp.user?.locale as 'fr' | 'en') ?? 'fr',
      );
      if (!ok) failedEmailCount++;
    }
    if (failedEmailCount > 0) {
      // Denominator is emails actually attempted (skips null-email recipients),
      // not `unique.length`, so the ratio reflects real send attempts.
      this.logger.error(
        `notifyScheduleChange: ${failedEmailCount}/${attemptedEmailCount} change email(s) failed for clinic ${clinicId}`,
      );
    }

    const pushIds = [...new Set(unique.map((r) => r.employeeId))].filter((id) =>
      byId.has(id),
    );
    if (pushIds.length > 0) {
      this.pushNotificationService
        .sendBatchPushNotifications(pushIds, {
          title: `${clinic.name} — Planning modifié`,
          body: 'Votre planning a été modifié. Vérifiez vos créneaux.',
          url: '/dashboard/schedule',
        })
        .catch((err: Error) =>
          this.logger.error(`Push schedule-change failed: ${err.message}`),
        );
    }
  }

  async moveShift(
    clinicId: string,
    shiftId: string,
    target: { targetEmployeeId?: string; targetDate?: string },
    options: { acknowledgePublishedChange?: boolean } = {},
  ): Promise<ScheduleShift> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.clinicId !== clinicId)
      throw new ForbiddenException('Shift does not belong to this clinic');

    if (target.targetDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(target.targetDate)) {
        throw new BadRequestException('Invalid date format');
      }
      const parsedDate = new Date(`${target.targetDate}T00:00:00.000Z`);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Invalid date value');
      }
    }

    if (target.targetEmployeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: target.targetEmployeeId, clinicId, isActive: true },
      });
      if (!employee)
        throw new NotFoundException('Target employee not found or inactive');
    }

    // Story 7.6 — post-publication guard (checks BOTH months on a cross-month move)
    const originalEmployeeId = shift.employeeId;
    const originalDateISO = shift.date.toISOString().split('T')[0];
    const originalMonth = originalDateISO.slice(0, 7);
    const targetMonth = target.targetDate
      ? target.targetDate.slice(0, 7)
      : originalMonth;
    const publishedMonths = await this.assertPublishedChangeAcknowledged(
      clinicId,
      [originalMonth, targetMonth],
      options.acknowledgePublishedChange ?? false,
    );

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

    const employeeChanged =
      !!target.targetEmployeeId && target.targetEmployeeId !== shift.employeeId;
    const dateChanged =
      !!target.targetDate && target.targetDate !== originalDateISO;

    // Story 11-6 — the shift mutation and the amendment bookkeeping commit
    // atomically. If recordAmendment throws, shift.update rolls back, so a
    // moved shift can never be left without its amendment record. Notification
    // fires AFTER commit (below), so a rolled-back change never notifies.
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

    // Story 7.6 — post-commit notification (published months only), fire-and-forget
    if (amend) {
      const updatedMonth = updated.date.toISOString().split('T')[0].slice(0, 7);
      const recipients = [
        { employeeId: originalEmployeeId, month: originalMonth },
        { employeeId: updated.employeeId, month: updatedMonth },
      ].filter((r) => publishedMonths.includes(r.month));
      this.notifyScheduleChange(clinicId, recipients).catch((err: Error) =>
        this.logger.error(
          `schedule-change notification failed: ${err.message}`,
        ),
      );
    }

    const shiftTypes = await this.clinicService.listShiftTypes(clinicId);
    const colorMap = new Map(shiftTypes.map((st) => [st.code, st.color]));

    return {
      id: updated.id,
      date: updated.date.toISOString().split('T')[0],
      startTime: updated.startTime,
      endTime: updated.endTime,
      shiftTypeCode: updated.shiftTypeCode,
      breakMinutes: updated.breakMinutes,
      source: updated.source as 'GENERATED' | 'MANUAL',
      employeeId: updated.employeeId,
      isConfirmed: updated.isConfirmed,
      shiftTypeColor: colorMap.get(updated.shiftTypeCode) ?? null,
    };
  }

  async createManualShift(
    clinicId: string,
    input: {
      employeeId: string;
      date: string;
      shiftTypeCode: string;
      startTime: string;
      endTime: string;
      breakMinutes?: number;
      acknowledgePublishedChange?: boolean;
    },
  ): Promise<ScheduleShift> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, clinicId, isActive: true },
    });
    if (!employee)
      throw new NotFoundException('Employee not found or inactive');

    // Lookup ClinicShiftType for accurate times
    const shiftType = await this.prisma.clinicShiftType.findFirst({
      where: { code: input.shiftTypeCode, clinicId },
    });
    if (!shiftType)
      throw new NotFoundException(
        `Shift type '${input.shiftTypeCode}' not found`,
      );

    // Story 7.6 — post-publication guard
    const month = input.date.slice(0, 7);
    const publishedMonths = await this.assertPublishedChangeAcknowledged(
      clinicId,
      [month],
      input.acknowledgePublishedChange ?? false,
    );

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

    // Story 11-3 — statutory French labor-law HARD check. Load the employee's shifts in a
    // window around the target day (ISO week + neighbours) and reject the create if it would
    // breach a statutory limit. Enforced regardless of configured rules.
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
    const created = await this.prisma.$transaction(async (tx) => {
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
    });

    // Story 7.6 — post-commit notification (published month only), fire-and-forget
    if (publishedMonths.length > 0) {
      this.notifyScheduleChange(clinicId, [
        { employeeId: created.employeeId, month },
      ]).catch((err: Error) =>
        this.logger.error(
          `schedule-change notification failed: ${err.message}`,
        ),
      );
    }

    const shiftTypes = await this.clinicService.listShiftTypes(clinicId);
    const colorMap = new Map(shiftTypes.map((st) => [st.code, st.color]));

    return {
      id: created.id,
      date: created.date.toISOString().split('T')[0],
      startTime: created.startTime,
      endTime: created.endTime,
      shiftTypeCode: created.shiftTypeCode,
      breakMinutes: created.breakMinutes,
      source: created.source as 'GENERATED' | 'MANUAL',
      employeeId: created.employeeId,
      isConfirmed: created.isConfirmed,
      shiftTypeColor: colorMap.get(created.shiftTypeCode) ?? null,
    };
  }

  async deleteShift(
    clinicId: string,
    shiftId: string,
    options: { acknowledgePublishedChange?: boolean } = {},
  ): Promise<{ deleted: true }> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.clinicId !== clinicId)
      throw new ForbiddenException('Shift does not belong to this clinic');

    // Story 7.6 — post-publication guard
    const month = shift.date.toISOString().split('T')[0].slice(0, 7);
    const publishedMonths = await this.assertPublishedChangeAcknowledged(
      clinicId,
      [month],
      options.acknowledgePublishedChange ?? false,
    );

    // Story 11-6 — delete + amendment commit atomically; notify post-commit.
    await this.prisma.$transaction(async (tx) => {
      await tx.shift.delete({ where: { id: shiftId } });
      if (publishedMonths.length > 0) {
        await this.recordAmendment(tx, clinicId, publishedMonths);
      }
    });

    if (publishedMonths.length > 0) {
      this.notifyScheduleChange(clinicId, [
        { employeeId: shift.employeeId, month },
      ]).catch((err: Error) =>
        this.logger.error(
          `schedule-change notification failed: ${err.message}`,
        ),
      );
    }

    return { deleted: true };
  }

  async preValidateMove(
    clinicId: string,
    input: { shiftId: string; targetEmployeeId: string; targetDate: string },
  ): Promise<MoveValidationResult> {
    const hard: Array<{ rule: string; message: string }> = [];
    const soft: Array<{ rule: string; message: string }> = [];

    // Load the shift
    const shift = await this.prisma.shift.findUnique({
      where: { id: input.shiftId },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.clinicId !== clinicId)
      throw new ForbiddenException('Shift does not belong to this clinic');

    // Parallelize independent DB queries after shift ownership check
    const targetDateObj = new Date(`${input.targetDate}T00:00:00.000Z`);
    const [year, monthNum] = input.targetDate
      .substring(0, 7)
      .split('-')
      .map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    const [
      employee,
      operationalConfig,
      unavailabilities,
      existingShifts,
      rules,
    ] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: input.targetEmployeeId, clinicId, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobType: true,
          contractHours: true,
        },
      }),
      this.clinicService.getOperationalConfig(clinicId),
      this.prisma.unavailability.findMany({
        where: {
          employeeId: input.targetEmployeeId,
          clinicId,
          startDate: { lte: new Date(`${input.targetDate}T23:59:59.999Z`) },
          endDate: { gte: new Date(`${input.targetDate}T00:00:00.000Z`) },
        },
      }),
      this.prisma.shift.findMany({
        where: {
          employeeId: input.targetEmployeeId,
          clinicId,
          date: { in: this.adjacentDayRange(input.targetDate) },
          id: { not: input.shiftId },
        },
      }),
      this.planningService.listRules(clinicId, { isActive: true }),
    ]);

    // Verify target employee
    if (!employee) {
      hard.push({
        rule: 'EMPLOYEE',
        message: 'Target employee not found or inactive',
      });
      return { hard, soft };
    }

    // Check closed/non-work days
    const dayNameToIso: Record<string, number> = {
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 7,
    };
    const workDaySet = new Set(
      operationalConfig.workDays
        .map((d: string) => dayNameToIso[d])
        .filter(Boolean),
    );
    const closedDateSet = new Set(
      operationalConfig.closedDays.map((cd: { date: string }) => cd.date),
    );

    if (closedDateSet.has(input.targetDate)) {
      hard.push({ rule: 'CLOSED_DAY', message: 'Target date is a closed day' });
    }

    const targetIsoDay =
      targetDateObj.getUTCDay() === 0 ? 7 : targetDateObj.getUTCDay();
    if (!workDaySet.has(targetIsoDay)) {
      hard.push({
        rule: 'NON_WORK_DAY',
        message: 'Target date is not a work day',
      });
    }

    // Check unavailabilities
    for (const ua of unavailabilities) {
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

    // HARD SKILL_REQUIREMENT check
    for (const rule of rules.filter(
      (r) => r.ruleType === 'HARD' && r.category === 'SKILL_REQUIREMENT',
    )) {
      const config = rule.config as Record<string, unknown>;
      if (config.shiftTypeCode === shift.shiftTypeCode) {
        const requiredJobTypes = config.requiredJobTypes as string[];
        if (requiredJobTypes && !requiredJobTypes.includes(employee.jobType)) {
          hard.push({
            rule: 'SKILL_REQUIREMENT',
            message: `Employee job type ${employee.jobType} does not match required: ${requiredJobTypes.join(', ')}`,
          });
        }
      }
    }

    // CONTRACT_COMPLIANCE check — respects HARD vs SOFT ruleType
    const shiftMinutes =
      this.calculateShiftMinutes(shift.startTime, shift.endTime) -
      (shift.breakMinutes || 0);
    const weekBounds = this.getWeekBounds(input.targetDate);

    const weekShifts = await this.prisma.shift.findMany({
      where: {
        employeeId: input.targetEmployeeId,
        clinicId,
        date: {
          gte: new Date(`${weekBounds.start}T00:00:00.000Z`),
          lte: new Date(`${weekBounds.end}T23:59:59.999Z`),
        },
        id: { not: input.shiftId },
      },
    });

    let weeklyMinutes = 0;
    for (const ws of weekShifts) {
      weeklyMinutes +=
        this.calculateShiftMinutes(ws.startTime, ws.endTime) -
        (ws.breakMinutes || 0);
    }

    const projectedWeeklyMinutes = weeklyMinutes + shiftMinutes;
    const projectedWeeklyHours =
      Math.round((projectedWeeklyMinutes / 60) * 10) / 10;
    const contractWeeklyMinutes = employee.contractHours * 60;

    for (const rule of rules.filter(
      (r) => r.category === 'CONTRACT_COMPLIANCE',
    )) {
      const config = rule.config as Record<string, unknown>;
      const maxWeekly = config.maxWeeklyHours as number | undefined;
      const effectiveLimit = maxWeekly
        ? Math.min(employee.contractHours, maxWeekly)
        : employee.contractHours;

      // Story 11-8 — weekly cap decision delegated to the shared rule engine.
      // maxMonthlyHours is stripped so only the weekly cap is evaluated,
      // matching the move's historic weekly-only semantics.
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

    // If no contract rules exist, still warn based on contractHours
    if (
      rules.filter((r) => r.category === 'CONTRACT_COMPLIANCE').length === 0
    ) {
      if (projectedWeeklyMinutes > contractWeeklyMinutes) {
        soft.push({
          rule: 'CONTRACT_COMPLIANCE',
          message: `Overtime risk: ${projectedWeeklyHours}h this week, contract limit ${employee.contractHours}h`,
        });
      }
    }

    // ROTATION_EQUITY check — load monthShifts once before the loop
    const monthShifts = await this.prisma.shift.findMany({
      where: {
        employeeId: input.targetEmployeeId,
        clinicId,
        date: { gte: monthStart, lte: monthEnd },
        id: { not: input.shiftId },
      },
    });

    // Pre-load quarterly shifts (other months in same quarter) for quarterly-tracked rules
    const quarter = Math.floor((monthNum - 1) / 3);
    const quarterStart = new Date(Date.UTC(year, quarter * 3, 1));
    const quarterEnd = new Date(
      Date.UTC(year, quarter * 3 + 3, 0, 23, 59, 59, 999),
    );
    let quarterlyShifts: typeof monthShifts | null = null;

    for (const rule of rules.filter((r) => r.category === 'ROTATION_EQUITY')) {
      const config = rule.config as Record<string, unknown>;
      const targetDay = config.targetDay as string;
      const maxPerPeriod = config.maxPerPeriod as number;
      const trackingPeriod = config.trackingPeriod as string | undefined;
      const dayMap: Record<string, number> = {
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        sunday: 7,
      };
      const ruleDayIso = dayMap[targetDay];
      if (!ruleDayIso || ruleDayIso !== targetIsoDay) continue;

      const applicableJobTypes = config.applicableJobTypes as
        | string[]
        | undefined;
      if (
        applicableJobTypes &&
        applicableJobTypes.length > 0 &&
        !applicableJobTypes.includes(employee.jobType)
      ) {
        continue;
      }

      // Load quarterly shifts lazily on first quarterly rule
      let shiftPool = monthShifts;
      if (trackingPeriod === 'quarterly') {
        if (!quarterlyShifts) {
          quarterlyShifts = await this.prisma.shift.findMany({
            where: {
              employeeId: input.targetEmployeeId,
              clinicId,
              date: { gte: quarterStart, lte: quarterEnd },
              id: { not: input.shiftId },
              NOT: { date: { gte: monthStart, lte: monthEnd } },
            },
          });
        }
        shiftPool = [...monthShifts, ...quarterlyShifts];
      }

      const targetDayCount = shiftPool.filter((s) => {
        const d = s.date.getUTCDay() === 0 ? 7 : s.date.getUTCDay();
        return d === ruleDayIso;
      }).length;

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
    }

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

  async publishPlan(
    clinicId: string,
    month: string,
    userId: string,
  ): Promise<{ publishedAt: string; totalWithShifts: number }> {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(
        `Invalid month format: ${month}. Expected YYYY-MM`,
      );
    }

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
    const endDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    // Quick-exit: if already published and no changes, skip re-publishing
    const existingStatus = await this.prisma.planningPeriodStatus.findUnique({
      where: { clinicId_month: { clinicId, month } },
    });
    if (existingStatus?.status === 'PUBLISHED') {
      const shiftsModifiedAfterPublish = await this.prisma.shift.count({
        where: {
          clinicId,
          date: { gte: startDate, lte: endDate },
          updatedAt: { gt: existingStatus.publishedAt! },
        },
      });
      if (shiftsModifiedAfterPublish === 0) {
        const totalWithShifts = await this.prisma.employee.count({
          where: {
            clinicId,
            isActive: true,
            shifts: { some: { date: { gte: startDate, lte: endDate } } },
          },
        });
        return {
          publishedAt: existingStatus.publishedAt!.toISOString(),
          totalWithShifts,
        };
      }
    }

    // Pre-check: validate hard violations before publishing (best-effort, non-transactional)
    const { hardViolations } =
      await this.planningService.validateShiftsAgainstRules(clinicId, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

    if (hardViolations.length > 0) {
      throw new ConflictException(
        `Cannot publish: ${hardViolations.length} hard violation(s) remain. Resolve them before publishing.`,
      );
    }

    // Upsert publication status atomically
    const now = await this.withSerializationRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          // Story 11-5 — take the SAME (clinicId, month) advisory lock as
          // generation so a publish serializes against a concurrent regeneration
          // or a double-clicked publish instead of racing. Auto-released at
          // COMMIT / ROLLBACK on the interactive transaction's pinned connection.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${clinicId}), hashtext(${month}))`;

          const publishedAt = new Date();
          await tx.planningPeriodStatus.upsert({
            where: { clinicId_month: { clinicId, month } },
            create: {
              clinicId,
              month,
              status: 'PUBLISHED',
              publishedAt,
              publishedBy: userId,
            },
            update: {
              status: 'PUBLISHED',
              publishedAt,
              publishedBy: userId,
            },
          });

          return publishedAt;
        },
        {
          timeout: 15000,
        },
      ),
    );

    // Fetch all employees with shifts in the month (for total count)
    const [allEmployeesWithShifts, clinic] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          clinicId,
          isActive: true,
          email: { not: null },
          shifts: { some: { date: { gte: startDate, lte: endDate } } },
        },
        select: {
          id: true,
          firstName: true,
          email: true,
          notifyOnPublish: true,
          user: { select: { locale: true } },
          _count: {
            select: {
              shifts: { where: { date: { gte: startDate, lte: endDate } } },
            },
          },
        },
      }),
      this.prisma.clinic.findUniqueOrThrow({
        where: { id: clinicId },
        select: { name: true },
      }),
    ]);

    const totalWithShifts = allEmployeesWithShifts.length;

    // Filter to only those with notifyOnPublish: true
    const eligibleEmployees = allEmployeesWithShifts.filter(
      (e) => e.notifyOnPublish,
    );

    // Send notifications (Trigger.dev if configured, direct otherwise)
    const useTrigger = !!process.env.TRIGGER_SECRET_KEY;

    if (eligibleEmployees.length > 0) {
      const emailPayloads = eligibleEmployees.map((emp) => ({
        to: emp.email!,
        firstName: emp.firstName,
        shiftCount: emp._count.shifts,
        locale: (emp.user?.locale as 'fr' | 'en') ?? 'fr',
      }));

      if (useTrigger) {
        // Async via Trigger.dev — fire-and-forget. Story 11-4 (AC1): pass a
        // stable idempotency-key seed (unique per publish via `now`, the
        // publishedAt timestamp) so the task's retries never duplicate an
        // already-delivered email.
        batchEmailPublishTask
          .trigger({
            emails: emailPayloads,
            month,
            clinicName: clinic.name,
            idempotencyKey: `schedule-publish/${clinicId}:${month}:${now.getTime()}`,
          })
          .catch((err: Error) =>
            this.logger.error(
              `Trigger batch-email-publish failed: ${err.message}`,
            ),
          );
      } else {
        // Direct send (fallback). Story 11-4 (AC2): react to the returned count
        // so a partial/total publication-email failure is visible (NFR3).
        const notified =
          await this.mailService.sendBatchSchedulePublicationEmails(
            emailPayloads,
            month,
            clinic.name,
          );
        if (notified < emailPayloads.length) {
          this.logger.error(
            `publishPlan: ${emailPayloads.length - notified}/${emailPayloads.length} publication email(s) failed for clinic ${clinicId}, month ${month}`,
          );
        }
      }
    }

    // Push notifications
    const pushEligibleIds = eligibleEmployees.map((e) => e.id);
    if (useTrigger) {
      batchPushPublishTask
        .trigger({
          employeeIds: pushEligibleIds,
          title: `${clinic.name} — Planning publié`,
          body: `Votre planning de ${month} est disponible.`,
          url: '/dashboard/schedule',
        })
        .catch((err: Error) =>
          this.logger.error(
            `Trigger batch-push-publish failed: ${err.message}`,
          ),
        );
    } else {
      this.pushNotificationService
        .sendBatchPushNotifications(pushEligibleIds, {
          title: `${clinic.name} — Planning publié`,
          body: `Votre planning de ${month} est disponible.`,
          url: '/dashboard/schedule',
        })
        .catch((err: Error) =>
          this.logger.error(`Push batch failed: ${err.message}`),
        );
    }

    this.logger.log(
      `Published plan for clinic ${clinicId}, month ${month}. ${totalWithShifts} employees with shifts, ${eligibleEmployees.length} eligible for notifications${useTrigger ? ' (via Trigger.dev)' : ''}.`,
    );

    return {
      publishedAt: now.toISOString(),
      totalWithShifts,
    };
  }

  async getPublicationStatus(
    clinicId: string,
    month: string,
  ): Promise<{
    status: 'DRAFT' | 'PUBLISHED';
    publishedAt: string | null;
    publishedBy: string | null;
    amendedAt: string | null;
    amendmentCount: number;
  }> {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(
        `Invalid month format: ${month}. Expected YYYY-MM`,
      );
    }

    const record = await this.prisma.planningPeriodStatus.findUnique({
      where: { clinicId_month: { clinicId, month } },
    });

    if (!record) {
      return {
        status: 'DRAFT',
        publishedAt: null,
        publishedBy: null,
        amendedAt: null,
        amendmentCount: 0,
      };
    }

    return {
      status: record.status as 'DRAFT' | 'PUBLISHED',
      publishedAt: record.publishedAt?.toISOString() ?? null,
      publishedBy: record.publishedBy,
      amendedAt: record.amendedAt?.toISOString() ?? null,
      amendmentCount: record.amendmentCount,
    };
  }

  async getPublishPreview(
    clinicId: string,
    month: string,
  ): Promise<{
    employees: Array<{
      id: string;
      firstName: string;
      lastName: string;
      shiftCount: number;
      notifyOnPublish: boolean;
    }>;
    emailCount: number;
    disabledCount: number;
    totalWithShifts: number;
  }> {
    if (!PlanningGenerationService.MONTH_REGEX.test(month)) {
      throw new BadRequestException(
        `Invalid month format: ${month}. Expected YYYY-MM`,
      );
    }

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
    const endDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

    const employeesWithShifts = await this.prisma.employee.findMany({
      where: {
        clinicId,
        isActive: true,
        email: { not: null },
        shifts: { some: { date: { gte: startDate, lte: endDate } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        notifyOnPublish: true,
        _count: {
          select: {
            shifts: { where: { date: { gte: startDate, lte: endDate } } },
          },
        },
      },
      orderBy: { lastName: 'asc' },
    });

    const employees = employeesWithShifts.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      shiftCount: e._count.shifts,
      notifyOnPublish: e.notifyOnPublish,
    }));

    const emailCount = employees.filter((e) => e.notifyOnPublish).length;
    const disabledCount = employees.filter((e) => !e.notifyOnPublish).length;

    return {
      employees,
      emailCount,
      disabledCount,
      totalWithShifts: employees.length,
    };
  }

  private buildEquitySummary(
    equityCounters: CounterWithEmployee[],
    rules?: Array<{ category: string; config: unknown }>,
  ): EquitySummaryEntry[] {
    if (equityCounters.length === 0) return [];

    // Build maxPerPeriod lookup from ROTATION_EQUITY rules: counterType → maxPerPeriod
    // Note: only SATURDAY_WORKED has a dedicated counter; sunday has no distinct counter
    const dayToCounterType: Record<string, string> = {
      saturday: 'SATURDAY_WORKED',
    };
    const maxPerPeriodByType = new Map<string, number>();
    if (rules) {
      for (const rule of rules) {
        if (rule.category !== 'ROTATION_EQUITY') continue;
        const config = rule.config as Record<string, unknown>;
        const targetDay = config.targetDay as string | undefined;
        const maxPerPeriod = config.maxPerPeriod as number | undefined;
        if (targetDay && maxPerPeriod !== undefined) {
          const ct = dayToCounterType[targetDay];
          if (ct) {
            maxPerPeriodByType.set(ct, maxPerPeriod);
          }
        }
      }
    }

    // Group counters by employee
    const byEmployee = new Map<
      string,
      Array<{ counterType: string; count: number }>
    >();
    for (const counter of equityCounters) {
      const existing = byEmployee.get(counter.employee.id) || [];
      existing.push({ counterType: counter.counterType, count: counter.count });
      byEmployee.set(counter.employee.id, existing);
    }

    // Compute clinic averages per counter type
    const avgByType = new Map<string, { sum: number; count: number }>();
    for (const counter of equityCounters) {
      const entry = avgByType.get(counter.counterType) || { sum: 0, count: 0 };
      entry.sum += counter.count;
      entry.count += 1;
      avgByType.set(counter.counterType, entry);
    }

    const clinicAverages = new Map<string, number>();
    for (const [type, data] of avgByType) {
      clinicAverages.set(type, Math.round((data.sum / data.count) * 10) / 10);
    }

    // Build summary entries
    const entries: EquitySummaryEntry[] = [];
    for (const [employeeId, counters] of byEmployee) {
      entries.push({
        employeeId,
        counters: counters.map((c) => ({
          counterType: c.counterType,
          count: c.count,
          clinicAverage: clinicAverages.get(c.counterType) ?? 0,
          maxPerPeriod: maxPerPeriodByType.get(c.counterType) ?? null,
        })),
      });
    }

    return entries;
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

  // checkRotationEquity: supports trackingPeriod (monthly/quarterly) + job type filter
  // Story 11-10 — O(1) lookup via the incremental rotation index.
  private checkRotationEquity(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
    softViols: GenerationResult['violations']['soft'],
  ) {
    const applicableJobTypes = rule.config.applicableJobTypes as
      | string[]
      | undefined;
    if (
      applicableJobTypes &&
      applicableJobTypes.length > 0 &&
      !applicableJobTypes.includes(employee.jobType)
    ) {
      return;
    }

    const targetDay = rule.config.targetDay as string;
    const maxPerPeriod = rule.config.maxPerPeriod as number;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return;

    if (this.isoDayOf(slot.date) !== targetIsoDay) return;

    const count = this.countFromDayIndex(
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
      employee.id,
      targetIsoDay,
      trackingPeriod,
    );

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

  // Soft CONTRACT_COMPLIANCE: checks maxWeeklyHours and maxMonthlyHours caps
  private checkContractCompliance(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    employeeMinutes: Map<string, number>,
    weeklyMinutesMap: Map<string, number>,
    softViols: GenerationResult['violations']['soft'],
  ) {
    const config = rule.config;
    const shiftMinutes =
      this.calculateShiftMinutes(slot.startTime, slot.endTime) -
      (slot.breakMinutes || 0);

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

    // Check maxWeeklyHours
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
    survivorCoveredPositions = 0,
    engine: 'greedy' | 'cpsat' = 'greedy',
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
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
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
        // Filled = newly generated rows + positions already covered by survivors
        // (Story 11-2 AC3 metric — a survivor-covered position is filled, not a gap).
        filledSlots: assignments.length + survivorCoveredPositions,
        holeCount: holes.length,
        hardViolationCount: hardViolations.length,
        softWarningCount: softViolations.length,
        // Story 12-1 — which engine produced the served assignments.
        engine,
      },
    };
  }

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

  private calculateShiftMinutes(startTime: string, endTime: string): number {
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

  // Story 11-10 — per-(employee, ISO-weekday) rotation index. Maintained
  // incrementally (mirrors the FIX-4 O(1) counters) so the three rotation-equity
  // evaluators do an O(1) lookup instead of re-filtering the flat alreadyAssigned
  // array (O(A), allocating a Date per element) per employee per slot per rule —
  // the last O(E×A) scan in the generation loop. Outer key: employeeId. Inner key:
  // ISO weekday 1..7. Value: shift count on that weekday.
  private isoDayOf(dateStr: string): number {
    const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
    return dow === 0 ? 7 : dow;
  }

  private incrementDayOfWeekCount(
    index: Map<string, Map<number, number>>,
    employeeId: string,
    dateStr: string,
  ): void {
    const iso = this.isoDayOf(dateStr);
    let byDay = index.get(employeeId);
    if (!byDay) {
      byDay = new Map<number, number>();
      index.set(employeeId, byDay);
    }
    byDay.set(iso, (byDay.get(iso) || 0) + 1);
  }

  private buildDayOfWeekIndex(
    shifts: AssignedShift[],
  ): Map<string, Map<number, number>> {
    const index = new Map<string, Map<number, number>>();
    for (const s of shifts) {
      this.incrementDayOfWeekCount(index, s.employeeId, s.date);
    }
    return index;
  }

  // Equivalent to the old `[...alreadyAssigned, ...quarterlyShifts].filter(...)`:
  // the live index reflects alreadyAssigned (border + survivors + assigned), the
  // quarterly index reflects constraints.quarterlyShifts. Sum only when quarterly.
  private countFromDayIndex(
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
    employeeId: string,
    targetIsoDay: number,
    trackingPeriod: string | undefined,
  ): number {
    const live = dayOfWeekCounts.get(employeeId)?.get(targetIsoDay) || 0;
    if (trackingPeriod !== 'quarterly') return live;
    const historical =
      quarterlyDayOfWeekCounts.get(employeeId)?.get(targetIsoDay) || 0;
    return live + historical;
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

  // Story 11-10 — O(1) lookup via the incremental rotation index. Behaviour
  // preserved: applicableJobTypes gate, slot-day early-exit, quarterly inclusion.
  private violatesHardRotationEquity(
    rule: RuleEntry,
    slot: SlotRequirement,
    employee: EmployeeInfo,
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
  ): boolean {
    const applicableJobTypes = rule.config.applicableJobTypes as
      | string[]
      | undefined;
    if (
      applicableJobTypes &&
      applicableJobTypes.length > 0 &&
      !applicableJobTypes.includes(employee.jobType)
    ) {
      return false;
    }

    const targetDay = rule.config.targetDay as string;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return false;

    if (this.isoDayOf(slot.date) !== targetIsoDay) return false;

    // Story 11-10 — O(1) count via the incremental rotation index.
    // maxPerPeriod is read from rule.config inside violatesHardRotation.
    // Story 11-8 — route the final decision through the unified rule engine
    // (violatesHardRotation === count >= maxPerPeriod, plus the applicableJobTypes
    // gate we already short-circuit above): unified AND O(1).
    const count = this.countFromDayIndex(
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
      employee.id,
      targetIsoDay,
      trackingPeriod,
    );
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

  // Average overtime minutes across all employees
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
   * Story 11-7 — return the employee's equity entry, creating a zero-initialised
   * one when absent (new hire, January boundary, or an inactive-employee
   * survivor). Guarantees every scoring / increment site sees a real entry
   * instead of short-circuiting to a flat scoring bonus, and keeps
   * getAverageEquity's denominator the whole seeded workforce.
   */
  private getOrCreateEquityEntry(
    equityMap: ConstraintMap['equityMap'],
    employeeId: string,
  ): {
    saturdayCount: number;
    weekendCount: number;
    holidayCount: number;
    overtimeMinutes: number;
  } {
    let entry = equityMap.get(employeeId);
    if (!entry) {
      entry = {
        saturdayCount: 0,
        weekendCount: 0,
        holidayCount: 0,
        overtimeMinutes: 0,
      };
      equityMap.set(employeeId, entry);
    }
    return entry;
  }

  /**
   * Story 11-9 — bounded local-repair pass. Phase 1: hole-repair via depth-<=2 ejection chains.
   * Phase 2: equity hill-climbing swaps against the global equity objective. Every candidate move is
   * validated with the shared evaluateEligibility predicate and applied through applyAssignment /
   * removeAssignment so all counters stay in lockstep. Additions (backfill, swap) are checked on
   * pre-apply state; the ejection mover is checked on post-removal state (its vacated shift lifted off
   * the counters first). Returns the recomputed holes.
   */
  private async runLocalRepairPass(ctx: {
    employees: EmployeeInfo[];
    slots: SlotRequirement[];
    constraints: ConstraintMap;
    assignedShifts: AssignedShift[];
    allShiftsForScoring: AssignedShift[];
    assignmentIndex: Map<string, AssignedShift[]>;
    weeklyMinutesCounter: Map<string, number>;
    employeeMinutes: Map<string, number>;
    shiftTypeCounts: Map<string, Map<string, number>>;
    employeeShiftCounts: Map<string, number>;
    dayOfWeekCounts: Map<string, Map<number, number>>;
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>;
    preExistingSlotCoverage: Map<
      string,
      Array<{
        startTime: string;
        endTime: string;
        jobType: string | null;
        consumed: boolean;
      }>
    >;
    priorHoles: GenerationResult['holes'];
  }): Promise<GenerationResult['holes']> {
    const eligibilityCtx = {
      constraints: ctx.constraints,
      assignmentIndex: ctx.assignmentIndex,
      weeklyMinutesCounter: ctx.weeklyMinutesCounter,
      employeeMinutes: ctx.employeeMinutes,
      dayOfWeekCounts: ctx.dayOfWeekCounts,
      quarterlyDayOfWeekCounts: ctx.quarterlyDayOfWeekCounts,
    };
    const employeeById = new Map(ctx.employees.map((e) => [e.id, e]));
    const employeeIds = ctx.employees.map((e) => e.id).sort();

    const slotIdOf = (
      date: string,
      shiftTypeCode: string,
      startTime: string,
    ): string => `${date}|${shiftTypeCode}|${startTime}`;

    const asSlotRequirement = (rslot: RepairSlot): SlotRequirement => ({
      date: rslot.date,
      shiftTypeCode: rslot.shiftTypeCode,
      startTime: rslot.startTime,
      endTime: rslot.endTime,
      breakMinutes: rslot.breakMinutes,
      requiredStaff: 1,
      requiredJobTypes: rslot.requiredJobTypes,
    });

    // Additions (backfill, swap) — the injected predicate the pure search calls. Strict rotation
    // (no greedy relaxation): the repair must never introduce a HARD violation.
    const isEligible = (employeeId: string, rslot: RepairSlot): boolean => {
      const emp = employeeById.get(employeeId);
      if (!emp) return false;
      return this.evaluateEligibility(
        emp,
        asSlotRequirement(rslot),
        eligibilityCtx,
      ).eligible;
    };

    // An ejection MOVER — eligibility for its target slot (the hole, or a previously vacated slot
    // in a depth-3 chain) evaluated on POST-removal state: lift its vacated shift off the live
    // counters, test, then restore exactly. Sound because removing only relaxes; this is what lets
    // a capped mover reach a slot it could not fill while still on its own.
    const isMoverEligible = (
      moverEmployeeId: string,
      holeR: RepairSlot,
      vacatedR: RepairSlot,
    ): boolean => {
      const emp = employeeById.get(moverEmployeeId);
      if (!emp) return false;
      const moverShift = ctx.assignedShifts.find(
        (s) =>
          s.employeeId === moverEmployeeId &&
          slotIdOf(s.date, s.shiftTypeCode, s.startTime) === vacatedR.id,
      );
      if (!moverShift) return false;
      this.removeAssignment(moverShift, ctx);
      const ok = this.evaluateEligibility(
        emp,
        asSlotRequirement(holeR),
        eligibilityCtx,
      ).eligible;
      this.applyAssignment(moverShift, ctx);
      return ok;
    };

    // Belt-and-suspenders: an already-applied shift is valid iff removing it and re-checking the
    // add passes. Sound design means this never fires, but a false verdict reverts the whole chain.
    const isAppliedShiftValid = (shift: AssignedShift): boolean => {
      const emp = employeeById.get(shift.employeeId);
      if (!emp) return false;
      const slotView = slotById.get(
        slotIdOf(shift.date, shift.shiftTypeCode, shift.startTime),
      );
      this.removeAssignment(shift, ctx);
      const ok = this.evaluateEligibility(
        emp,
        {
          date: shift.date,
          shiftTypeCode: shift.shiftTypeCode,
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakMinutes: shift.breakMinutes ?? 0,
          requiredStaff: 1,
          requiredJobTypes: slotView?.requiredJobTypes,
        },
        eligibilityCtx,
      ).eligible;
      this.applyAssignment(shift, ctx);
      return ok;
    };

    // Build the RepairSlot view (one per demand slot key) once; slot ids are deterministic.
    const slotById = new Map<string, RepairSlot>();
    for (const s of ctx.slots) {
      const id = slotIdOf(s.date, s.shiftTypeCode, s.startTime);
      if (!slotById.has(id)) {
        slotById.set(id, {
          id,
          date: s.date,
          shiftTypeCode: s.shiftTypeCode,
          startTime: s.startTime,
          endTime: s.endTime,
          breakMinutes: s.breakMinutes,
          requiredJobTypes: s.requiredJobTypes,
        });
      }
    }

    // ── Phase 1: hole-repair via ejection chains ────────────────────────────────
    // KON-128 — ONE depth-3 budget for the whole pass: a scarce month with many
    // depth-2-unrepairable holes must not pay the full budget per hole (NFR2).
    const depth3Budget = {
      remaining: PlanningGenerationService.DEPTH3_PASS_EVALUATION_BUDGET,
    };
    let yields = 0;
    const holes = this.recomputeHoles(
      ctx.slots,
      ctx.assignedShifts,
      ctx.preExistingSlotCoverage,
      ctx.priorHoles,
    );
    for (const hole of holes) {
      if (hole.assignedStaff >= hole.requiredStaff) continue;
      const holeSlot = slotById.get(
        slotIdOf(
          hole.date,
          hole.shiftTypeCode,
          this.slotStartFor(ctx.slots, hole),
        ),
      );
      if (!holeSlot) continue;
      if (++yields % PlanningGenerationService.REPAIR_YIELD_EVERY === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      const currentAssignments: RepairAssignment[] = ctx.assignedShifts.map(
        (s) => ({
          slotId: slotIdOf(s.date, s.shiftTypeCode, s.startTime),
          employeeId: s.employeeId,
        }),
      );
      const chain = findEjectionChain(
        holeSlot,
        currentAssignments,
        slotById,
        employeeIds,
        isEligible,
        isMoverEligible,
        { depth3Budget },
      );
      if (!chain) continue;

      // Resolve every mover's current shift and target slot before touching any counter.
      const moverShifts: AssignedShift[] = [];
      const targetSlots: RepairSlot[] = [];
      let chainResolved = true;
      for (const move of chain.moves) {
        const shift = ctx.assignedShifts.find(
          (s) =>
            s.employeeId === move.employeeId &&
            slotIdOf(s.date, s.shiftTypeCode, s.startTime) === move.fromSlotId,
        );
        const target = slotById.get(move.toSlotId);
        if (!shift || !target) {
          chainResolved = false;
          break;
        }
        moverShifts.push(shift);
        targetSlots.push(target);
      }
      const backfillSlot = slotById.get(chain.backfillSlotId);
      if (!chainResolved || !backfillSlot) continue;

      // Apply: eject every mover, place each on its target, backfill the last vacated slot.
      for (const shift of moverShifts) this.removeAssignment(shift, ctx);
      const applied: AssignedShift[] = chain.moves.map((move, i) => ({
        employeeId: move.employeeId,
        date: targetSlots[i].date,
        startTime: targetSlots[i].startTime,
        endTime: targetSlots[i].endTime,
        shiftTypeCode: targetSlots[i].shiftTypeCode,
        breakMinutes: targetSlots[i].breakMinutes,
      }));
      applied.push({
        employeeId: chain.backfillEmployeeId,
        date: backfillSlot.date,
        startTime: backfillSlot.startTime,
        endTime: backfillSlot.endTime,
        shiftTypeCode: backfillSlot.shiftTypeCode,
        breakMinutes: backfillSlot.breakMinutes,
      });
      for (const shift of applied) this.applyAssignment(shift, ctx);

      // Revert the whole chain if any applied shift is somehow invalid (unreachable by design).
      if (applied.some((shift) => !isAppliedShiftValid(shift))) {
        for (const shift of [...applied].reverse())
          this.removeAssignment(shift, ctx);
        for (const shift of moverShifts) this.applyAssignment(shift, ctx);
      }
    }

    // ── Phase 2: equity hill-climbing swaps ─────────────────────────────────────
    // KON-128 — the objective is scale-normalized per metric and weighted from the clinic's
    // ROTATION_EQUITY rule priorities (saturday rules boost the saturday term, sunday rules the
    // weekend term, via the codebase-wide 1 + priority/10 convention).
    const equityWeights = deriveEquityWeights([
      ...ctx.constraints.hardRules,
      ...ctx.constraints.softRules,
    ]);
    // Unlike Phase 1 (ejection), swaps need no post-apply revert: selectImprovingSwap checks each
    // employee against the target slot on PRE-swap state, where each still carries its old slot's
    // load, so the pre-swap check is strictly stricter than the true post-swap state (every
    // eligibility counter is monotone in the employee's own shift set; a swap only ever removes one
    // shift and adds one). A pair that passes therefore stays valid after the swap — no false accept.
    for (
      let iter = 0;
      iter < PlanningGenerationService.MAX_HILLCLIMB_ITERATIONS;
      iter++
    ) {
      if (++yields % PlanningGenerationService.REPAIR_YIELD_EVERY === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      const assignments: RepairAssignment[] = ctx.assignedShifts.map((s) => ({
        slotId: slotIdOf(s.date, s.shiftTypeCode, s.startTime),
        employeeId: s.employeeId,
      }));
      const swap = selectImprovingSwap(
        assignments,
        slotById,
        isEligible,
        equityWeights,
      );
      if (!swap) break; // local optimum reached — objective is monotone non-increasing

      const shiftA = ctx.assignedShifts.find(
        (s) =>
          s.employeeId === swap.employeeA &&
          slotIdOf(s.date, s.shiftTypeCode, s.startTime) === swap.slotIdA,
      );
      const shiftB = ctx.assignedShifts.find(
        (s) =>
          s.employeeId === swap.employeeB &&
          slotIdOf(s.date, s.shiftTypeCode, s.startTime) === swap.slotIdB,
      );
      const slotA = slotById.get(swap.slotIdA);
      const slotB = slotById.get(swap.slotIdB);
      if (!shiftA || !shiftB || !slotA || !slotB) break;

      this.removeAssignment(shiftA, ctx);
      this.removeAssignment(shiftB, ctx);
      this.applyAssignment(
        {
          employeeId: swap.employeeB,
          date: slotA.date,
          startTime: slotA.startTime,
          endTime: slotA.endTime,
          shiftTypeCode: slotA.shiftTypeCode,
          breakMinutes: slotA.breakMinutes,
        },
        ctx,
      );
      this.applyAssignment(
        {
          employeeId: swap.employeeA,
          date: slotB.date,
          startTime: slotB.startTime,
          endTime: slotB.endTime,
          shiftTypeCode: slotB.shiftTypeCode,
          breakMinutes: slotB.breakMinutes,
        },
        ctx,
      );
    }

    // AC4 — recompute holes from the final assignments; each keeps a visible reason.
    return this.recomputeHoles(
      ctx.slots,
      ctx.assignedShifts,
      ctx.preExistingSlotCoverage,
      ctx.priorHoles,
    );
  }

  /**
   * Story 12-1 (KON-129) — CP-SAT improve pass. Builds the solver's model from the
   * PRE-greedy fixed baseline (survivors/border/school), hints it with the current
   * greedy(+repair) plan, and serves the solver's plan only when it is strictly
   * better on the EXACT objectives (fill count, then the KON-128 weighted equity
   * objective) AND survives a full re-validation REPLAY: every GENERATED assignment
   * is removed from the live counters, then each candidate assignment is re-checked
   * through evaluateEligibility (the single predicate the greedy loop and the repair
   * pass use — rules, statutory law, overlaps, rotation without relaxation) and
   * re-applied via applyAssignment. Eligibility is monotone (adding only tightens),
   * so a fully-valid candidate passes in any replay order. Any rejection reverts to
   * the greedy plan with a visible warn log (NFR3). On success the live counters and
   * ctx.assignedShifts ARE the candidate; returns the recomputed holes, or null when
   * the greedy plan is kept.
   */
  private async runSolverImprovePass(ctx: {
    employees: EmployeeInfo[];
    slots: SlotRequirement[];
    constraints: ConstraintMap;
    assignedShifts: AssignedShift[];
    allShiftsForScoring: AssignedShift[];
    assignmentIndex: Map<string, AssignedShift[]>;
    weeklyMinutesCounter: Map<string, number>;
    employeeMinutes: Map<string, number>;
    shiftTypeCounts: Map<string, Map<string, number>>;
    employeeShiftCounts: Map<string, number>;
    dayOfWeekCounts: Map<string, Map<number, number>>;
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>;
    preExistingSlotCoverage: Map<
      string,
      Array<{
        startTime: string;
        endTime: string;
        jobType: string | null;
        consumed: boolean;
      }>
    >;
    priorHoles: GenerationResult['holes'];
    baseline: {
      weeklyMinutes: Map<string, number>;
      fixedShiftsByEmployee: Map<string, AssignedShift[]>;
      rotationCounts: Map<string, Map<number, number>>;
    };
  }): Promise<GenerationResult['holes'] | null> {
    // ── 1) Solver input from the generation context ────────────────────────────
    // Contract caps lift the SAME semantics as the CONTRACT_COMPLIANCE eligibility
    // branch (rule-engine): weekly = min(contractHours, maxWeeklyHours) with the
    // rule's overtime tolerance; monthly = maxMonthlyHours with tolerance. A rule
    // declaring no cap constrains nothing (KON-125 m3). The model only needs sound
    // bounds — the replay below is the exact gate.
    const hardContractRules = ctx.constraints.hardRules.filter(
      (r) => r.category === 'CONTRACT_COMPLIANCE',
    );
    const PHYSICAL_WEEK_MINUTES = 7 * 24 * 60;
    const capsFor = (emp: EmployeeInfo) => {
      let weekly = PHYSICAL_WEEK_MINUTES;
      let monthly: number | null = null;
      for (const rule of hardContractRules) {
        const cfg = rule.config as {
          maxWeeklyHours?: number;
          maxMonthlyHours?: number;
          overtimeThresholdPercent?: number;
        };
        const tol = 1 + (cfg.overtimeThresholdPercent ?? 0) / 100;
        // Mirror violatesHardContractIncremental (rule-engine.ts) EXACTLY: a HARD
        // CONTRACT_COMPLIANCE rule with no maxWeeklyHours still caps the week at the
        // employee's contractHours. Omitting that fallback (KON-129 regression) let
        // the solver search a ~168h/week space for maxMonthlyHours-only rules, so
        // its optimum tripped the real weekly cap on replay and the whole candidate
        // was discarded — AC1 silently degraded to "always serve greedy" for that
        // clinic class. The replay stays the exact gate; this only makes the model's
        // bound match reality so a genuinely-better plan can actually be served.
        const ruleWeekly =
          cfg.maxWeeklyHours !== undefined
            ? Math.min(emp.contractHours, cfg.maxWeeklyHours)
            : emp.contractHours;
        weekly = Math.min(weekly, Math.floor(ruleWeekly * 60 * tol));
        if (cfg.maxMonthlyHours !== undefined) {
          const cap = Math.floor(cfg.maxMonthlyHours * 60 * tol);
          monthly = monthly === null ? cap : Math.min(monthly, cap);
        }
      }
      return { weekly, monthly };
    };

    const rotationRules = ctx.constraints.hardRules
      .filter((r) => r.category === 'ROTATION_EQUITY')
      .map((r) => {
        const cfg = r.config as {
          targetDay?: string;
          maxPerPeriod?: number;
          trackingPeriod?: string;
          applicableJobTypes?: string[];
        };
        return {
          targetIsoDay:
            PlanningGenerationService.DAY_NAME_TO_ISO[cfg.targetDay ?? ''] ?? 0,
          maxPerPeriod: cfg.maxPerPeriod ?? 0,
          trackingPeriod: cfg.trackingPeriod,
          applicableJobTypes: cfg.applicableJobTypes,
        };
      })
      .filter((r) => r.targetIsoDay > 0 && r.maxPerPeriod > 0);

    // One solver slot per (date, shiftTypeCode, startTime) with its AGGREGATED
    // capacity, reduced by the survivor coverage the greedy loop consumed
    // (recomputeHoles counts the same `consumed` flags — single source of truth).
    // No per-position expansion: an employee can hold at most one position of an
    // identical-times slot anyway (overlap), so x[e,slot] ∈ {0,1} with a
    // requiredStaff fill cap is exactly equivalent — and halves the model size
    // while removing the position symmetry CP-SAT search hates.
    const consumedByKey = new Map<string, number>();
    for (const [key, bucket] of ctx.preExistingSlotCoverage) {
      consumedByKey.set(key, bucket.filter((c) => c.consumed).length);
    }
    const aggregated = new Map<string, SolverInput['slots'][number]>();
    for (const slot of [...ctx.slots].sort((a, b) =>
      `${a.date}|${a.shiftTypeCode}|${a.startTime}`.localeCompare(
        `${b.date}|${b.shiftTypeCode}|${b.startTime}`,
      ),
    )) {
      const coverageKey = `${slot.date}|${slot.shiftTypeCode}`;
      const consumed = consumedByKey.get(coverageKey) ?? 0;
      const residual = Math.max(0, slot.requiredStaff - consumed);
      consumedByKey.set(
        coverageKey,
        Math.max(0, consumed - slot.requiredStaff),
      );
      if (residual === 0) continue;
      const baseKey = `${slot.date}|${slot.shiftTypeCode}|${slot.startTime}`;
      const existing = aggregated.get(baseKey);
      if (existing) {
        existing.requiredStaff += residual;
      } else {
        aggregated.set(baseKey, {
          id: baseKey,
          date: slot.date,
          shiftTypeCode: slot.shiftTypeCode,
          startTime: slot.startTime,
          endTime: slot.endTime,
          breakMinutes: slot.breakMinutes || 0,
          requiredStaff: residual,
          requiredJobTypes: slot.requiredJobTypes,
        });
      }
    }
    const positionSlots: SolverInput['slots'] = [...aggregated.values()];

    // Fixed per-day baseline (survivors + border): net minutes and worked dates.
    const fixedDailyMinutes = new Map<string, number>();
    const fixedWorkedDates = new Map<string, Set<string>>();
    for (const [empId, shifts] of ctx.baseline.fixedShiftsByEmployee) {
      for (const s of shifts) {
        const netMin =
          this.calculateShiftMinutes(s.startTime, s.endTime) -
          (s.breakMinutes || 0);
        const dayKey = `${empId}|${s.date}`;
        fixedDailyMinutes.set(
          dayKey,
          (fixedDailyMinutes.get(dayKey) || 0) + netMin,
        );
        if (!fixedWorkedDates.has(empId))
          fixedWorkedDates.set(empId, new Set());
        fixedWorkedDates.get(empId)!.add(s.date);
      }
    }

    // Fixed rotation history: pre-greedy in-run counts, plus the quarterly index
    // for rules tracking quarterly (both immutable during the run).
    const fixedRotationCounts = new Map<string, number>();
    for (const rule of rotationRules) {
      for (const emp of ctx.employees) {
        let fixed =
          ctx.baseline.rotationCounts.get(emp.id)?.get(rule.targetIsoDay) ?? 0;
        if (rule.trackingPeriod === 'quarterly') {
          fixed +=
            ctx.quarterlyDayOfWeekCounts.get(emp.id)?.get(rule.targetIsoDay) ??
            0;
        }
        if (fixed > 0)
          fixedRotationCounts.set(`${emp.id}|${rule.targetIsoDay}`, fixed);
      }
    }

    const equityWeights = deriveEquityWeights([
      ...ctx.constraints.hardRules,
      ...ctx.constraints.softRules,
    ]);

    const input: SolverInput = {
      employees: ctx.employees.map((e) => {
        const caps = capsFor(e);
        return {
          id: e.id,
          jobType: e.jobType,
          weeklyCapMinutes: caps.weekly,
          monthlyCapMinutes: caps.monthly,
        };
      }),
      slots: positionSlots,
      unavailable: ctx.constraints.unavailableMap,
      fixedWeeklyMinutes: ctx.baseline.weeklyMinutes,
      fixedDailyMinutes,
      fixedWorkedDates,
      fixedRotationCounts,
      rotationRules: rotationRules.map((r) => ({
        targetIsoDay: r.targetIsoDay,
        maxPerPeriod: r.maxPerPeriod,
        applicableJobTypes: r.applicableJobTypes,
      })),
      equityWeights,
    };

    const model = buildSolverModel(input);

    // ── 2) Hint = the greedy(+repair) plan mapped onto (employee, slot) vars ───
    const hint = new Set<string>();
    for (const s of ctx.assignedShifts) {
      hint.add(`${s.employeeId}@${s.date}|${s.shiftTypeCode}|${s.startTime}`);
    }

    const result = await this.solverEngine.solve(model, {
      deterministicTimeBudget:
        PlanningGenerationService.SOLVER_DETERMINISTIC_BUDGET,
      hint,
    });
    if (result.status !== 'OPTIMAL' && result.status !== 'FEASIBLE') {
      this.logger.warn(
        `KON-129 solver status ${result.status} — serving the greedy plan`,
      );
      return null;
    }

    const candidate = decodeSolution(model, result.chosenVarNames, input);

    // ── 3) Strictly-better gate on the EXACT objectives ────────────────────────
    const repairSlotById = new Map<string, RepairSlot>();
    for (const s of ctx.slots) {
      const id = `${s.date}|${s.shiftTypeCode}|${s.startTime}`;
      if (!repairSlotById.has(id)) {
        repairSlotById.set(id, {
          id,
          date: s.date,
          shiftTypeCode: s.shiftTypeCode,
          startTime: s.startTime,
          endTime: s.endTime,
          breakMinutes: s.breakMinutes,
          requiredJobTypes: s.requiredJobTypes,
        });
      }
    }
    const toRepairAssignments = (
      shifts: Array<{
        employeeId: string;
        date: string;
        shiftTypeCode: string;
        startTime: string;
      }>,
    ): RepairAssignment[] =>
      shifts.map((s) => ({
        slotId: `${s.date}|${s.shiftTypeCode}|${s.startTime}`,
        employeeId: s.employeeId,
      }));
    const greedyEquity = equityObjective(
      computeLoads(toRepairAssignments(ctx.assignedShifts), repairSlotById),
      equityWeights,
    );
    const candidateEquity = equityObjective(
      computeLoads(toRepairAssignments(candidate), repairSlotById),
      equityWeights,
    );
    const greedyFilled = ctx.assignedShifts.length;
    const strictlyBetter =
      candidate.length > greedyFilled ||
      (candidate.length === greedyFilled &&
        candidateEquity < greedyEquity - 1e-9);
    if (!strictlyBetter) {
      // AC3 groups "not strictly better" with the other non-served outcomes under a
      // structured warn log (NFR3 — never silent). warn, not log, so it surfaces at
      // the same level as the timeout / infeasible / re-validation-reject branches.
      this.logger.warn(
        `KON-129 solver ${result.status}: filled ${candidate.length}/${greedyFilled}, equity ${candidateEquity.toFixed(4)} vs ${greedyEquity.toFixed(4)} — greedy plan kept`,
      );
      return null;
    }

    // ── 4) Re-validation REPLAY through the live counters ──────────────────────
    const employeeById = new Map(ctx.employees.map((e) => [e.id, e]));
    const eligibilityCtx = {
      constraints: ctx.constraints,
      assignmentIndex: ctx.assignmentIndex,
      weeklyMinutesCounter: ctx.weeklyMinutesCounter,
      employeeMinutes: ctx.employeeMinutes,
      dayOfWeekCounts: ctx.dayOfWeekCounts,
      quarterlyDayOfWeekCounts: ctx.quarterlyDayOfWeekCounts,
    };
    const requiredJobTypesByKey = new Map<string, string[] | undefined>();
    for (const s of ctx.slots) {
      requiredJobTypesByKey.set(
        `${s.date}|${s.shiftTypeCode}|${s.startTime}`,
        s.requiredJobTypes,
      );
    }

    const original = [...ctx.assignedShifts];
    for (const s of original) this.removeAssignment(s, ctx);

    const applied: AssignedShift[] = [];
    let rejection: string | null = null;
    for (const c of candidate) {
      const emp = employeeById.get(c.employeeId);
      if (!emp) {
        rejection = `unknown employee ${c.employeeId}`;
        break;
      }
      const verdict = this.evaluateEligibility(
        emp,
        {
          date: c.date,
          shiftTypeCode: c.shiftTypeCode,
          startTime: c.startTime,
          endTime: c.endTime,
          breakMinutes: c.breakMinutes,
          requiredStaff: 1,
          requiredJobTypes: requiredJobTypesByKey.get(
            `${c.date}|${c.shiftTypeCode}|${c.startTime}`,
          ),
        },
        eligibilityCtx,
      );
      if (!verdict.eligible) {
        rejection = `${c.employeeId} ineligible on ${c.date} ${c.startTime}`;
        break;
      }
      const shift: AssignedShift = {
        employeeId: c.employeeId,
        date: c.date,
        startTime: c.startTime,
        endTime: c.endTime,
        shiftTypeCode: c.shiftTypeCode,
        breakMinutes: c.breakMinutes,
      };
      this.applyAssignment(shift, ctx);
      applied.push(shift);
    }

    if (rejection) {
      for (const s of [...applied].reverse()) this.removeAssignment(s, ctx);
      for (const s of original) this.applyAssignment(s, ctx);
      this.logger.warn(
        `KON-129 solver plan rejected by re-validation (${rejection}) — serving the greedy plan`,
      );
      return null;
    }

    this.logger.log(
      `KON-129 solver plan SERVED: ${result.status}, filled ${candidate.length} (greedy ${greedyFilled}), equity ${candidateEquity.toFixed(4)} (greedy ${greedyEquity.toFixed(4)})`,
    );
    return this.recomputeHoles(
      ctx.slots,
      ctx.assignedShifts,
      ctx.preExistingSlotCoverage,
      ctx.priorHoles,
    );
  }

  /** Story 11-9 — add a GENERATED assignment and increment EVERY live counter in lockstep. */
  private applyAssignment(
    shift: AssignedShift,
    ctx: {
      assignedShifts: AssignedShift[];
      allShiftsForScoring: AssignedShift[];
      assignmentIndex: Map<string, AssignedShift[]>;
      weeklyMinutesCounter: Map<string, number>;
      employeeMinutes: Map<string, number>;
      shiftTypeCounts: Map<string, Map<string, number>>;
      employeeShiftCounts: Map<string, number>;
      constraints: ConstraintMap;
      dayOfWeekCounts: Map<string, Map<number, number>>;
    },
  ): void {
    ctx.assignedShifts.push(shift);
    ctx.allShiftsForScoring.push(shift);
    const key = `${shift.employeeId}|${shift.date}`;
    ctx.assignmentIndex.set(key, [
      ...(ctx.assignmentIndex.get(key) || []),
      shift,
    ]);

    const netMin =
      this.calculateShiftMinutes(shift.startTime, shift.endTime) -
      (shift.breakMinutes || 0);
    const weekKey = `${shift.employeeId}|${this.getWeekBounds(shift.date).start}`;
    ctx.weeklyMinutesCounter.set(
      weekKey,
      (ctx.weeklyMinutesCounter.get(weekKey) || 0) + netMin,
    );
    ctx.employeeMinutes.set(
      shift.employeeId,
      (ctx.employeeMinutes.get(shift.employeeId) || 0) + netMin,
    );

    let typeCounts = ctx.shiftTypeCounts.get(shift.employeeId);
    if (!typeCounts) {
      typeCounts = new Map();
      ctx.shiftTypeCounts.set(shift.employeeId, typeCounts);
    }
    typeCounts.set(
      shift.shiftTypeCode,
      (typeCounts.get(shift.shiftTypeCode) || 0) + 1,
    );
    ctx.employeeShiftCounts.set(
      shift.employeeId,
      (ctx.employeeShiftCounts.get(shift.employeeId) || 0) + 1,
    );

    const dow = new Date(`${shift.date}T00:00:00.000Z`).getUTCDay();
    const equity = this.getOrCreateEquityEntry(
      ctx.constraints.equityMap,
      shift.employeeId,
    );
    if (dow === 6) equity.saturdayCount++;
    if (dow === 0 || dow === 6) equity.weekendCount++;
    this.incrementDayOfWeekCount(
      ctx.dayOfWeekCounts,
      shift.employeeId,
      shift.date,
    );
  }

  /** Story 11-9 — remove a GENERATED assignment and decrement EVERY live counter in lockstep. */
  private removeAssignment(
    shift: AssignedShift,
    ctx: {
      assignedShifts: AssignedShift[];
      allShiftsForScoring: AssignedShift[];
      assignmentIndex: Map<string, AssignedShift[]>;
      weeklyMinutesCounter: Map<string, number>;
      employeeMinutes: Map<string, number>;
      shiftTypeCounts: Map<string, Map<string, number>>;
      employeeShiftCounts: Map<string, number>;
      constraints: ConstraintMap;
      dayOfWeekCounts: Map<string, Map<number, number>>;
    },
  ): void {
    const same = (a: AssignedShift, b: AssignedShift) =>
      a.employeeId === b.employeeId &&
      a.date === b.date &&
      a.startTime === b.startTime &&
      a.shiftTypeCode === b.shiftTypeCode;
    const removeOne = (arr: AssignedShift[]) => {
      const i = arr.findIndex((s) => same(s, shift));
      if (i >= 0) arr.splice(i, 1);
    };
    removeOne(ctx.assignedShifts);
    removeOne(ctx.allShiftsForScoring);
    const key = `${shift.employeeId}|${shift.date}`;
    const bucket = ctx.assignmentIndex.get(key);
    if (bucket) {
      const i = bucket.findIndex((s) => same(s, shift));
      if (i >= 0) bucket.splice(i, 1);
      if (bucket.length === 0) ctx.assignmentIndex.delete(key);
    }

    const netMin =
      this.calculateShiftMinutes(shift.startTime, shift.endTime) -
      (shift.breakMinutes || 0);
    const weekKey = `${shift.employeeId}|${this.getWeekBounds(shift.date).start}`;
    ctx.weeklyMinutesCounter.set(
      weekKey,
      (ctx.weeklyMinutesCounter.get(weekKey) || 0) - netMin,
    );
    ctx.employeeMinutes.set(
      shift.employeeId,
      (ctx.employeeMinutes.get(shift.employeeId) || 0) - netMin,
    );

    const typeCounts = ctx.shiftTypeCounts.get(shift.employeeId);
    if (typeCounts)
      typeCounts.set(
        shift.shiftTypeCode,
        (typeCounts.get(shift.shiftTypeCode) || 0) - 1,
      );
    ctx.employeeShiftCounts.set(
      shift.employeeId,
      (ctx.employeeShiftCounts.get(shift.employeeId) || 0) - 1,
    );

    const dow = new Date(`${shift.date}T00:00:00.000Z`).getUTCDay();
    const equity = this.getOrCreateEquityEntry(
      ctx.constraints.equityMap,
      shift.employeeId,
    );
    if (dow === 6) equity.saturdayCount--;
    if (dow === 0 || dow === 6) equity.weekendCount--;
    this.decrementDayOfWeekCount(
      ctx.dayOfWeekCounts,
      shift.employeeId,
      shift.date,
    );
  }

  /** Story 11-9 — inverse of incrementDayOfWeekCount (never goes below 0). */
  private decrementDayOfWeekCount(
    index: Map<string, Map<number, number>>,
    employeeId: string,
    dateStr: string,
  ): void {
    const iso = this.isoDayOf(dateStr);
    const byDay = index.get(employeeId);
    if (!byDay) return;
    byDay.set(iso, Math.max(0, (byDay.get(iso) || 0) - 1));
  }

  /**
   * Story 11-9 (AC4) — recompute holes from the final assignments + survivor coverage. Reuses the
   * loop's per-slot reason when a hole persists on the same (date, shiftTypeCode); falls back to a
   * coverage reason otherwise so every remaining hole is explained to the admin.
   */
  private recomputeHoles(
    slots: SlotRequirement[],
    assignedShifts: AssignedShift[],
    preExistingSlotCoverage: Map<
      string,
      Array<{
        startTime: string;
        endTime: string;
        jobType: string | null;
        consumed: boolean;
      }>
    >,
    priorHoles: GenerationResult['holes'],
  ): GenerationResult['holes'] {
    const priorReason = new Map(
      priorHoles.map((h) => [`${h.date}|${h.shiftTypeCode}`, h.reason]),
    );
    // Aggregate demand per (date, shiftTypeCode).
    const demand = new Map<
      string,
      { slot: SlotRequirement; required: number }
    >();
    for (const s of slots) {
      const k = `${s.date}|${s.shiftTypeCode}`;
      const cur = demand.get(k);
      if (cur) cur.required += s.requiredStaff;
      else demand.set(k, { slot: s, required: s.requiredStaff });
    }
    // Coverage = generated assignments + survivor-covered positions, per key.
    const covered = new Map<string, number>();
    for (const a of assignedShifts) {
      const k = `${a.date}|${a.shiftTypeCode}`;
      covered.set(k, (covered.get(k) || 0) + 1);
    }
    for (const [k, bucket] of preExistingSlotCoverage) {
      const consumed = bucket.filter((c) => c.consumed).length;
      if (consumed > 0) covered.set(k, (covered.get(k) || 0) + consumed);
    }

    const holes: GenerationResult['holes'] = [];
    for (const [k, { slot, required }] of demand) {
      const assignedStaff = covered.get(k) || 0;
      if (assignedStaff < required) {
        holes.push({
          date: slot.date,
          shiftTypeCode: slot.shiftTypeCode,
          requiredStaff: required,
          assignedStaff,
          reason:
            priorReason.get(k) ??
            (assignedStaff === 0
              ? 'No eligible employee available after local repair'
              : `Only ${assignedStaff} of ${required} staff assigned after local repair`),
        });
      }
    }
    return holes;
  }

  /** Story 11-9 — resolve the demand slot's startTime for a recomputed hole (first matching slot). */
  private slotStartFor(
    slots: SlotRequirement[],
    hole: { date: string; shiftTypeCode: string },
  ): string {
    const match = slots.find(
      (s) => s.date === hole.date && s.shiftTypeCode === hole.shiftTypeCode,
    );
    return match ? match.startTime : '00:00';
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
    const firstDayStr = new Date(Date.UTC(year, monthNum - 1, 1))
      .toISOString()
      .split('T')[0];
    const lastDayStr = new Date(Date.UTC(year, monthNum, 0))
      .toISOString()
      .split('T')[0];

    const firstWeek = this.getWeekBounds(firstDayStr);
    const lastWeek = this.getWeekBounds(lastDayStr);

    // Collect border-day date strings, de-duplicated. Two sources:
    //   1) ISO-week straddle days — weekly-hour calc for a week spanning the month
    //      boundary (the original Story 11-2 purpose).
    //   2) Story 13-3 (KON-132) — the immediate calendar D-1 of the first day and
    //      D+1 of the last day, ALWAYS. When the month starts on a Monday (or ends
    //      on a Sunday) those neighbours live in a different ISO week, so the
    //      straddle logic alone never loads them — leaving the cross-midnight
    //      overlap / minRest / consecutive-day scans blind to an overnight shift on
    //      the adjacent day and letting the generator double-book across the month
    //      frontier. These land in a different ISO week from any in-month day, so
    //      they never perturb the weekly-hour totals.
    const borderDateStrs = new Set<string>();

    // First week overlap: days before month start in the same ISO week
    if (firstWeek.start < firstDayStr) {
      const cursor = new Date(`${firstWeek.start}T00:00:00Z`);
      const limit = new Date(`${firstDayStr}T00:00:00Z`);
      while (cursor < limit) {
        borderDateStrs.add(cursor.toISOString().split('T')[0]);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    // Last week overlap: days after month end in the same ISO week
    if (lastWeek.end > lastDayStr) {
      const cursor = new Date(`${lastDayStr}T00:00:00Z`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const limit = new Date(`${lastWeek.end}T00:00:00Z`);
      while (cursor <= limit) {
        borderDateStrs.add(cursor.toISOString().split('T')[0]);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    // Story 13-3 — always include the immediate calendar neighbours.
    borderDateStrs.add(this.getPreviousDate(firstDayStr));
    borderDateStrs.add(this.getNextDate(lastDayStr));

    if (borderDateStrs.size === 0) return [];

    const borderDates = [...borderDateStrs].map(
      (d) => new Date(`${d}T00:00:00.000Z`),
    );

    this.logger.debug(
      `Loading border week shifts for ${borderDates.length} days outside ${month}`,
    );

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

  // Story 11-2 — load the shifts INSIDE the target month that SURVIVE a
  // regeneration. This is the exact complement of the Story 11-1 bulk deleteMany
  // predicate (delete = source:GENERATED AND isConfirmed:false AND no-variance),
  // so it returns MANUAL shifts, confirmed GENERATED shifts, and GENERATED shifts
  // carrying VarianceEvent history — and EXCLUDES the unconfirmed, history-free
  // GENERATED shifts that are about to be deleted and regenerated. The generator
  // must see these survivors so it never double-books an employee, overruns their
  // contract hours, or over-staffs a slot they already cover. Same projection
  // shape as loadBorderWeekShifts, bounded to the target month.
  private async loadSurvivingShiftsInMonth(
    clinicId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<SurvivingShift[]> {
    const shifts = await this.prisma.shift.findMany({
      where: {
        clinicId,
        date: { gte: monthStart, lte: monthEnd },
        OR: [
          { source: { not: 'GENERATED' } },
          { isConfirmed: true },
          { varianceEvents: { some: {} } },
        ],
      },
      select: {
        employeeId: true,
        date: true,
        startTime: true,
        endTime: true,
        shiftTypeCode: true,
        breakMinutes: true,
        // Story 11-2 (AC3) — the survivor's jobType gates its coverage credit
        // against a slot's requiredJobTypes, exactly like AC1 eligibility.
        employee: { select: { jobType: true } },
      },
    });

    return shifts.map((s) => ({
      employeeId: s.employeeId,
      date: s.date.toISOString().split('T')[0],
      startTime: s.startTime,
      endTime: s.endTime,
      shiftTypeCode: s.shiftTypeCode,
      breakMinutes: s.breakMinutes,
      jobType: s.employee?.jobType ?? null,
    }));
  }

  // FIX 1 — MRV (Minimum Remaining Values) heuristic: process most constrained slots first.
  // Within each ISO week (to preserve the non-workday-first grouping), re-sort by eligible pool size.
  private reorderByMRV(
    slots: SlotRequirement[],
    employees: EmployeeInfo[],
    constraints: ConstraintMap,
  ): SlotRequirement[] {
    // Quick eligibility count: unavailability + jobType filter only (no contract checks — too expensive)
    const eligibleCount = (slot: SlotRequirement): number => {
      let count = 0;
      for (const emp of employees) {
        const unavail = constraints.unavailableMap.get(emp.id);
        if (unavail?.has(slot.date)) continue;
        if (
          slot.requiredJobTypes &&
          slot.requiredJobTypes.length > 0 &&
          !slot.requiredJobTypes.includes(emp.jobType)
        )
          continue;
        count++;
      }
      return count;
    };

    // Group by ISO week to preserve week-level ordering
    const weekGroups = new Map<string, SlotRequirement[]>();
    for (const slot of slots) {
      const weekKey = this.getWeekBounds(slot.date).start;
      const group = weekGroups.get(weekKey) || [];
      group.push(slot);
      weekGroups.set(weekKey, group);
    }

    const result: SlotRequirement[] = [];
    const sortedWeeks = [...weekGroups.keys()].sort();
    for (const weekKey of sortedWeeks) {
      const group = weekGroups.get(weekKey)!;
      // Within each week, sort by eligible count ascending (most constrained first)
      // Preserve existing order as tiebreaker (non-workdays first from previous sort)
      const indexed = group.map((slot, i) => ({
        slot,
        originalIdx: i,
        eligible: eligibleCount(slot),
      }));
      indexed.sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible - b.eligible;
        return a.originalIdx - b.originalIdx;
      });
      result.push(...indexed.map((x) => x.slot));
    }

    return result;
  }

  // Story 11-10 — O(1) lookup via the incremental rotation index (was an O(A)
  // filter over alreadyAssigned per employee per slot per rule).
  private countTargetDayShifts(
    rule: RuleEntry,
    employee: EmployeeInfo,
    dayOfWeekCounts: Map<string, Map<number, number>>,
    quarterlyDayOfWeekCounts: Map<string, Map<number, number>>,
  ): number {
    const targetDay = rule.config.targetDay as string;
    const targetIsoDay = PlanningGenerationService.DAY_NAME_TO_ISO[targetDay];
    if (!targetIsoDay) return 0;
    const trackingPeriod = rule.config.trackingPeriod as string | undefined;
    return this.countFromDayIndex(
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
      employee.id,
      targetIsoDay,
      trackingPeriod,
    );
  }
}
