// Shared property/integration harness for the planning engine (Story 13-8, KON-138).
// NOT a *.spec.ts — Jest never runs it as a suite. Its dev-only imports (fast-check,
// @nestjs/testing) are kept out of the production bundle by the `exclude` globs in BOTH
// `.swcrc` (the real build filter — nest-cli.json uses the SWC builder, which does NOT
// honour tsconfig's `exclude`) and `tsconfig.build.json` (belt-and-suspenders for any
// tsc-based consumer). See docs/reference/planning-invariant-harness.md § Build safety.
import { Test, TestingModule } from '@nestjs/testing';
import fc from 'fast-check';
import { PlanningGenerationService } from './planning-generation.service';
import { SolverEngineService } from './solver-engine.service';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { EquityCounterService } from './equity-counter.service';
import { ApprenticeDeclarationService } from './apprentice-declaration.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import { MailService } from '@/modules/mail/mail.service';
import { PushNotificationService } from '@/modules/notification/push-notification.service';
import type { TemplateData } from '@pawly/validators';

export const HARNESS_CLINIC_ID = 'clinic-123';
export const HARNESS_MONTH = '2026-03';
// Valid UUID so the tRPC generatePlanSchema (templateId: z.string().uuid()) accepts
// it on the real router path (AC-2). The property specs bypass router validation.
export const HARNESS_TEMPLATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Non-overlapping 4h shift-type menu: an employee may hold both on one day (8h < 10h,
// no overlap) without ever tripping a statutory limit. Kept ≤6h so MANDATORY_BREAK
// (>6h net) never applies and breakMinutes stays 0.
export const SHIFT_TYPE_MENU = [
  {
    id: 'st-surgery',
    code: 'SURGERY',
    name: 'Surgery',
    startTime: '08:00',
    endTime: '12:00',
    color: '#4f46e5',
    clinicId: HARNESS_CLINIC_ID,
  },
  {
    id: 'st-care',
    code: 'CARE',
    name: 'Care',
    startTime: '14:00',
    endTime: '18:00',
    color: '#f59e0b',
    clinicId: HARNESS_CLINIC_ID,
  },
  // KON-140 (V6) — the original 4h-only menu could never pressure the KON-139 rules:
  // no fixture contained a >=10h continuous trigger day, an amplitude-relevant span, or
  // a mandatory-break case, so the safety property validated them vacuously.
  {
    id: 'st-guard',
    code: 'GUARD',
    name: 'Guard',
    startTime: '07:30',
    endTime: '19:30', // 12h span, 40-min break -> 11h20 net: assignable under the 12h cap,
    breakMinutes: 40, // >=10h continuous REST_DAYS trigger, break rule satisfied.
    color: '#0ea5e9',
    clinicId: HARNESS_CLINIC_ID,
  },
  {
    id: 'st-night',
    code: 'NIGHT',
    name: 'Night',
    startTime: '21:00',
    endTime: '05:00', // overnight: exercises cross-midnight buckets, inter-day rest, wraps.
    color: '#334155',
    clinicId: HARNESS_CLINIC_ID,
  },
] as const;

const WORKDAY_NAMES = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;
const DOW_INDEX: Record<(typeof WORKDAY_NAMES)[number], number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
};

export type PlanningFixture = {
  month: string;
  templateId: string;
  operationalConfig: {
    workDays: string[];
    defaultStartTime: string;
    defaultEndTime: string;
    closedDays: Array<{ id: string; date: string; reason: string | null }>;
    specialDays: Array<{
      id: string;
      date: string;
      startTime: string;
      endTime: string;
      label: string | null;
    }>;
  };
  shiftTypes: Array<(typeof SHIFT_TYPE_MENU)[number]>;
  template: TemplateData;
  employees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    jobType: string;
    contractHours: number;
  }>;
  rules: unknown[];
  unavailabilities: unknown[];
  survivors: Array<{
    id: string;
    clinicId: string;
    employeeId: string;
    date: Date;
    startTime: string;
    endTime: string;
    shiftTypeCode: string;
    breakMinutes: number;
    source: string;
    isConfirmed: boolean;
    planningTemplateId: string | null;
    varianceEvents: unknown[];
    // `loadSurvivingShiftsInMonth` selects `employee: { select: { jobType } }` and reads
    // `s.employee?.jobType` to gate coverage credit against `slot.requiredJobTypes`
    // (F4). Carry the relation so the mock row shape matches the real Prisma projection
    // before anyone extends the arbitrary with job-type-gated slots.
    employee: { jobType: string };
  }>;
};

// ── fast-check arbitraries ────────────────────────────────────────────────
const employeesArb = fc.integer({ min: 1, max: 5 }).chain((n) =>
  fc.tuple(
    ...Array.from({ length: n }, (_, i) =>
      fc
        .record({
          jobType: fc.constantFrom('VET', 'ASV'),
          contractHours: fc.constantFrom(20, 35),
        })
        .map((r) => ({
          id: `emp-${i + 1}`,
          firstName: `E${i + 1}`,
          lastName: 'Test',
          jobType: r.jobType,
          contractHours: r.contractHours,
        })),
    ),
  ),
);

// 1-3 workdays; each drives a template day with 1-2 slots referencing the menu.
const workdaysArb = fc
  // KON-140 (V6) — up to 6 workdays: dense weeks pressure consecutive-days, weekly
  // ceilings and the rest-days windows instead of only sparse 1-3-day templates.
  .subarray([...WORKDAY_NAMES], { minLength: 1, maxLength: WORKDAY_NAMES.length })
  .filter((d) => d.length > 0);

export const planningFixtureArb: fc.Arbitrary<PlanningFixture> = fc
  .record({
    employees: employeesArb,
    shiftTypes: fc
      .subarray([...SHIFT_TYPE_MENU], { minLength: 1, maxLength: 3 })
      .filter((s) => s.length > 0),
    workDays: workdaysArb,
    // 0 or 1 legal survivor per employee (built after employees are known).
    survivorEmpCount: fc.integer({ min: 0, max: 2 }),
  })
  .chain((base) =>
    fc
      .tuple(
        ...base.workDays.map(() =>
          fc
            .subarray(
              base.shiftTypes.map((s) => s.code),
              // cap at the sampled menu size — a 1-type menu can't yield a 2-slot day
              { minLength: 1, maxLength: base.shiftTypes.length },
            )
            .filter((c) => c.length > 0),
        ),
      )
      .map((slotCodesPerDay) => {
        const days: TemplateData['days'] = base.workDays.map((dayName, i) => ({
          dayOfWeek: DOW_INDEX[dayName as (typeof WORKDAY_NAMES)[number]],
          slots: slotCodesPerDay[i].map((code) => ({
            shiftTypeCode: code,
            requiredStaff: 1,
          })),
        }));
        // Legal-by-construction survivors: one 4h SURGERY on 2026-03-02 (Monday),
        // ≤6h, single day → satisfies every statutory rule. distinct employees.
        const survivorEmps = base.employees.slice(
          0,
          Math.min(base.survivorEmpCount, base.employees.length),
        );
        const survivors = survivorEmps.map((e, i) => ({
          id: `surv-${i}`,
          clinicId: HARNESS_CLINIC_ID,
          employeeId: e.id,
          date: new Date('2026-03-02T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
          source: 'MANUAL',
          isConfirmed: true,
          planningTemplateId: null,
          varianceEvents: [] as unknown[],
          // Match the real `loadSurvivingShiftsInMonth` projection (F4).
          employee: { jobType: e.jobType },
        }));
        return {
          month: HARNESS_MONTH,
          templateId: HARNESS_TEMPLATE_ID,
          operationalConfig: {
            workDays: base.workDays,
            defaultStartTime: '08:00',
            defaultEndTime: '18:00',
            closedDays: [],
            specialDays: [],
          },
          shiftTypes: base.shiftTypes,
          template: { days },
          employees: base.employees,
          rules: [], // configurable rules kept empty: P1 targets the non-configurable statutory floor.
          unavailabilities: [],
          survivors,
        } satisfies PlanningFixture;
      }),
  );

// ── Nest module: REAL generation service + REAL solver, mocked deps ────────
export type GenerationHarness = {
  module: TestingModule;
  service: PlanningGenerationService;
  solverEngine: SolverEngineService;
  prisma: any;
  clinic: any;
  planning: any;
  template: any;
  equity: any;
  apprentice: any;
};

export async function createGenerationHarness(): Promise<GenerationHarness> {
  const prisma = {
    employee: { findMany: jest.fn(), findFirst: jest.fn() },
    unavailability: { findMany: jest.fn() },
    shift: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      createManyAndReturn: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    clinicShiftType: { findFirst: jest.fn() },
    planningPeriodStatus: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    clinic: { findUniqueOrThrow: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn(),
  };
  const clinic = { getOperationalConfig: jest.fn(), listShiftTypes: jest.fn() };
  const planning = {
    listRules: jest.fn(),
    validateShiftsAgainstRules: jest.fn(),
  };
  const template = { getTemplateById: jest.fn() };
  const equity = {
    getCountersForPeriod: jest.fn(),
    getCountersForWindow: jest.fn(),
  };
  const apprentice = {
    getUndeclaredApprentices: jest.fn(),
    listForMonth: jest.fn(),
    upsertNoSchool: jest.fn(),
    deleteDeclaration: jest.fn(),
  };
  const mail = {
    sendSchedulePublicationEmail: jest.fn(),
    sendBatchSchedulePublicationEmails: jest.fn().mockResolvedValue(0),
    sendScheduleChangedEmail: jest.fn().mockResolvedValue(true),
  };
  const push = { sendBatchPushNotifications: jest.fn().mockResolvedValue(0) };

  const module = await Test.createTestingModule({
    providers: [
      PlanningGenerationService,
      SolverEngineService, // REAL solver adapter — tiny CP-SAT solves per run
      { provide: PrismaService, useValue: prisma },
      { provide: ClinicService, useValue: clinic },
      { provide: MailService, useValue: mail },
      { provide: PushNotificationService, useValue: push },
      { provide: PlanningService, useValue: planning },
      { provide: PlanningTemplateService, useValue: template },
      { provide: EquityCounterService, useValue: equity },
      { provide: ApprenticeDeclarationService, useValue: apprentice },
    ],
  }).compile();

  return {
    module,
    service: module.get(PlanningGenerationService),
    solverEngine: module.get(SolverEngineService),
    prisma,
    clinic,
    planning,
    template,
    equity,
    apprentice,
  };
}

// Wire every mock return from the sampled fixture. Call ONCE per generateMonthlyPlan
// invocation (it resets call history so per-run assertions stay isolated).
export function configureFixture(
  h: GenerationHarness,
  f: PlanningFixture,
): void {
  jest.clearAllMocks();
  h.clinic.getOperationalConfig.mockResolvedValue(f.operationalConfig);
  h.clinic.listShiftTypes.mockResolvedValue(f.shiftTypes);
  // The engine reads `template.data` (validated by templateDataSchema), so the
  // TemplateData sits under `.data` — not returned bare (confirmed at first RED).
  h.template.getTemplateById.mockResolvedValue({
    id: f.templateId,
    name: 'Harness',
    data: f.template,
  });
  h.planning.listRules.mockResolvedValue(f.rules);
  // Mocked whole-schedule evaluator: cpsat served-plan recompute reads THIS. P1 does
  // NOT trust it — it re-evaluates independently — so returning "clean" here is safe;
  // the served cpsat plan is separately protected by the real replay gate.
  h.planning.validateShiftsAgainstRules.mockResolvedValue({
    hardViolations: [],
    softViolations: [],
    rules: [],
  });
  h.equity.getCountersForPeriod.mockResolvedValue([]);
  h.equity.getCountersForWindow.mockResolvedValue([]);
  h.apprentice.getUndeclaredApprentices.mockResolvedValue([]);
  h.prisma.employee.findMany.mockResolvedValue(f.employees);
  h.prisma.unavailability.findMany.mockResolvedValue(f.unavailabilities);
  // shift.findMany is shared: survivors (where.OR), statutory context (where.date.gte/lte),
  // border-week (where.date.in). Only survivors return rows here.
  //
  // F5 — P1 soundness COUPLING: P1 re-evaluates "generated + f.survivors" per employee and
  // stays clean only because survivor context reaches the generation loop through THIS
  // outer OR query (so the engine's eligibility gate can reject a same-day conflict), while
  // the in-transaction `tx.shift.findMany` below returns []. If a future engine refactor
  // moved survivor loading INTO the write transaction, this mock would silently supply zero
  // survivors — the generator could then place a conflicting same-day shift and P1 would
  // emit a false MANDATORY_BREAK, or worse, mask a real one. Keep both reads in sync if that
  // loading path ever changes.
  h.prisma.shift.findMany.mockImplementation((args: any) => {
    if (args?.where?.OR) return Promise.resolve(f.survivors);
    return Promise.resolve([]);
  });
  h.prisma.shift.deleteMany.mockResolvedValue({ count: 0 });
  h.prisma.planningPeriodStatus.findMany.mockResolvedValue([]);
  h.prisma.planningPeriodStatus.updateMany.mockResolvedValue({ count: 0 });
  h.prisma.$executeRaw.mockResolvedValue(0);
  // Bespoke tx: echo createManyAndReturn so result.assignments reflects what the
  // generator actually decided to persist (a flat [] would make assignments vacuous).
  h.prisma.$transaction.mockImplementation(
    async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(0),
        shift: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          createManyAndReturn: jest.fn().mockImplementation((a: any) =>
            Promise.resolve(
              (a?.data ?? []).map((d: any, i: number) => ({
                ...d,
                id: `gen-${i}`,
              })),
            ),
          ),
        },
        planningPeriodStatus: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return fn(tx);
    },
  );
}

// A deterministic fixture aimed at exercising a full cpsat solve (AC-2). Full 31-day
// month, 3 employees, both shift types on Mon-Fri. Whether cpsat is SERVED or falls
// back, the router→service→solver→replay→transaction path executes end-to-end.
export function buildServedCpsatFixture(): PlanningFixture {
  const employees = [
    {
      id: 'emp-1',
      firstName: 'A',
      lastName: 'T',
      jobType: 'VET',
      contractHours: 35,
    },
    {
      id: 'emp-2',
      firstName: 'B',
      lastName: 'T',
      jobType: 'ASV',
      contractHours: 35,
    },
    {
      id: 'emp-3',
      firstName: 'C',
      lastName: 'T',
      jobType: 'VET',
      contractHours: 35,
    },
  ];
  const days: TemplateData['days'] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    slots: [
      { shiftTypeCode: 'SURGERY', requiredStaff: 1 },
      { shiftTypeCode: 'CARE', requiredStaff: 1 },
    ],
  }));
  return {
    month: HARNESS_MONTH,
    templateId: HARNESS_TEMPLATE_ID,
    operationalConfig: {
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      defaultStartTime: '08:00',
      defaultEndTime: '18:00',
      closedDays: [],
      specialDays: [],
    },
    shiftTypes: [...SHIFT_TYPE_MENU],
    template: { days },
    employees,
    rules: [],
    unavailabilities: [],
    survivors: [],
  };
}

// A deterministic fixture where the single greedy pass is provably SUBOPTIMAL, so the
// exact engine strictly improves it and is genuinely SERVED (engine='cpsat',
// solverOutcome='served'). Ported from the KON-128 depth-3 counter-example: 3 VETs each
// capped at ONE 4h SURGERY/month, 3 open Mondays (rest closed), crossed availabilities so
// greedy strands Mon3.
//
// Why it matters (F1): over the bounded `planningFixtureArb`, greedy(+repair) already fills
// every slot, so cpsat is never served — every cpsat property/AC-2 assertion collapses to a
// trivial greedy-vs-greedy check. This fixture is the ONE place the harness proves the
// exact engine actually solves, wins, survives replay-revalidation, and is served. Run it
// with `enableRepair: false` so the solver's baseline is the raw (hole-bearing) greedy plan
// rather than the repaired one — `enableRepair` is the engine's documented internal test
// seam (defaults ON; never forwarded by the tRPC route), so this isolates the solver's gain.
// This test also DOUBLES AS THE SOLVER CANARY: if or-tools fails to load (e.g. Node < 22.12),
// solve() degrades to ENGINE_UNAVAILABLE, the plan stays greedy, and the `engine==='cpsat'`
// assertion fails LOUDLY instead of the cpsat coverage silently going vacuous.
export function buildImprovableCpsatFixture(): PlanningFixture {
  const employees = [
    {
      id: 'emp-1',
      firstName: 'Alice',
      lastName: 'M',
      jobType: 'VET',
      contractHours: 35,
    },
    {
      id: 'emp-2',
      firstName: 'Bob',
      lastName: 'D',
      jobType: 'VET',
      contractHours: 35,
    },
    {
      id: 'emp-3',
      firstName: 'Carol',
      lastName: 'B',
      jobType: 'VET',
      contractHours: 35,
    },
  ];
  return {
    month: HARNESS_MONTH,
    templateId: HARNESS_TEMPLATE_ID,
    operationalConfig: {
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      defaultStartTime: '08:00',
      defaultEndTime: '18:00',
      // Close Mon4 (03-23) + Mon5 (03-30): exactly three open Mondays remain (02, 09, 16).
      closedDays: [
        { id: 'c1', date: '2026-03-23', reason: null },
        { id: 'c2', date: '2026-03-30', reason: null },
      ],
      specialDays: [],
    },
    // Single SURGERY slot per Monday, VET-only.
    shiftTypes: [SHIFT_TYPE_MENU[0]],
    template: {
      days: [
        {
          dayOfWeek: 1,
          slots: [
            {
              shiftTypeCode: 'SURGERY',
              requiredStaff: 1,
              requiredJobTypes: ['VET'],
            },
          ],
        },
      ],
    } as TemplateData,
    employees,
    // HARD cap: 4h/month ⇒ each VET can take at most ONE 4h SURGERY.
    rules: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'Max 4h/month',
        category: 'CONTRACT_COMPLIANCE',
        ruleType: 'HARD',
        config: { maxMonthlyHours: 4, overtimeThresholdPercent: 0 },
        priority: 10,
      },
    ],
    // Crossed leaves: Alice free Mon1+Mon3, Bob free Mon1+Mon2, Carol free Mon2 only.
    // Greedy strands Mon3 (03-16); only a multi-relocation chain (or the exact solver) fills it.
    unavailabilities: [
      {
        id: 'ua-a',
        employeeId: 'emp-1',
        type: 'VACATION',
        startDate: new Date('2026-03-09'),
        endDate: new Date('2026-03-09'),
        daysOfWeek: [],
      },
      {
        id: 'ua-b',
        employeeId: 'emp-2',
        type: 'VACATION',
        startDate: new Date('2026-03-16'),
        endDate: new Date('2026-03-16'),
        daysOfWeek: [],
      },
      {
        id: 'ua-c1',
        employeeId: 'emp-3',
        type: 'VACATION',
        startDate: new Date('2026-03-02'),
        endDate: new Date('2026-03-02'),
        daysOfWeek: [],
      },
      {
        id: 'ua-c2',
        employeeId: 'emp-3',
        type: 'VACATION',
        startDate: new Date('2026-03-16'),
        endDate: new Date('2026-03-16'),
        daysOfWeek: [],
      },
    ],
    survivors: [],
  };
}
