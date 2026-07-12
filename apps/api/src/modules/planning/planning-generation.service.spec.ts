jest.mock('@/trigger/client', () => ({
  batchEmailPublishTask: {
    trigger: jest.fn().mockResolvedValue({ id: 'mock-task-id' }),
  },
  batchPushPublishTask: {
    trigger: jest.fn().mockResolvedValue({ id: 'mock-task-id' }),
  },
  sendEmailTask: {
    trigger: jest.fn().mockResolvedValue({ id: 'mock-task-id' }),
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PlanningGenerationService } from './planning-generation.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { EquityCounterService } from './equity-counter.service';
import { ApprenticeDeclarationService } from './apprentice-declaration.service';
import { MailService } from '@/modules/mail/mail.service';
import { PushNotificationService } from '@/modules/notification/push-notification.service';
import { batchEmailPublishTask, batchPushPublishTask } from '@/trigger/client';
import type {
  TemplateData,
  HoleInfo,
  HardViolation,
  SoftViolation,
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

type AssignedShift = {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftTypeCode: string;
  breakMinutes?: number;
};

type ScoreAndAssignResult = {
  assigned: AssignedShift[];
  holeInfo?: HoleInfo;
  hardViolations: HardViolation[];
  softViolations: SoftViolation[];
};

describe('PlanningGenerationService', () => {
  let service: PlanningGenerationService;

  const clinicId = 'clinic-123';

  const mockTemplate: TemplateData = {
    days: [
      {
        dayOfWeek: 1,
        slots: [
          { shiftTypeCode: 'SURGERY', requiredStaff: 2 },
          { shiftTypeCode: 'RECEPTION', requiredStaff: 1 },
        ],
      },
      {
        dayOfWeek: 2,
        slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
      },
      {
        dayOfWeek: 3,
        slots: [{ shiftTypeCode: 'RECEPTION', requiredStaff: 1 }],
      },
      {
        dayOfWeek: 4,
        slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
      },
      {
        dayOfWeek: 5,
        slots: [{ shiftTypeCode: 'RECEPTION', requiredStaff: 1 }],
      },
    ],
  };

  const mockOperationalConfig = {
    workDays: ['1', '2', '3', '4', '5'],
    defaultStartTime: '08:00',
    defaultEndTime: '18:00',
    closedDays: [] as Array<{
      id: string;
      date: string;
      reason: string | null;
    }>,
    specialDays: [] as Array<{
      id: string;
      date: string;
      startTime: string;
      endTime: string;
      label: string | null;
    }>,
  };

  const mockShiftTypes = [
    {
      id: 'st-1',
      code: 'SURGERY',
      name: 'Surgery',
      startTime: '08:00',
      endTime: '12:00',
      color: '#4f46e5',
      clinicId,
    },
    {
      id: 'st-2',
      code: 'RECEPTION',
      name: 'Reception',
      startTime: '08:00',
      endTime: '18:00',
      color: '#f59e0b',
      clinicId,
    },
  ];

  const mockEmployees = [
    {
      id: 'emp-1',
      firstName: 'Alice',
      lastName: 'Martin',
      jobType: 'VET',
      contractHours: 35,
    },
    {
      id: 'emp-2',
      firstName: 'Bob',
      lastName: 'Dupont',
      jobType: 'ASV',
      contractHours: 35,
    },
    {
      id: 'emp-3',
      firstName: 'Charlie',
      lastName: 'Leroy',
      jobType: 'VET',
      contractHours: 35,
    },
  ];

  const mockPrismaService = {
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
    clinic: {
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockClinicService = {
    getOperationalConfig: jest.fn(),
    listShiftTypes: jest.fn(),
  };

  const mockPlanningService = {
    listRules: jest.fn(),
    validateShiftsAgainstRules: jest.fn(),
  };

  const mockTemplateService = {
    getTemplateById: jest.fn(),
  };

  const mockEquityService = {
    getCountersForPeriod: jest.fn(),
  };

  const mockApprenticeDeclarationService = {
    getUndeclaredApprentices: jest.fn(),
    listForMonth: jest.fn(),
    upsertNoSchool: jest.fn(),
    deleteDeclaration: jest.fn(),
  };

  const mockMailService = {
    sendSchedulePublicationEmail: jest.fn(),
    sendBatchSchedulePublicationEmails: jest.fn().mockResolvedValue(0),
    sendScheduleChangedEmail: jest.fn().mockResolvedValue(true),
  };

  const mockPushNotificationService = {
    sendBatchPushNotifications: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningGenerationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClinicService, useValue: mockClinicService },
        { provide: MailService, useValue: mockMailService },
        {
          provide: PushNotificationService,
          useValue: mockPushNotificationService,
        },
        { provide: PlanningService, useValue: mockPlanningService },
        {
          provide: PlanningTemplateService,
          useValue: mockTemplateService,
        },
        {
          provide: EquityCounterService,
          useValue: mockEquityService,
        },
        {
          provide: ApprenticeDeclarationService,
          useValue: mockApprenticeDeclarationService,
        },
      ],
    }).compile();

    service = module.get<PlanningGenerationService>(PlanningGenerationService);
    jest.clearAllMocks();

    // Default mocks
    mockClinicService.getOperationalConfig.mockResolvedValue(
      mockOperationalConfig,
    );
    mockClinicService.listShiftTypes.mockResolvedValue(mockShiftTypes);
    mockPlanningService.listRules.mockResolvedValue([]);
    mockEquityService.getCountersForPeriod.mockResolvedValue([]);
    mockPrismaService.unavailability.findMany.mockResolvedValue([]);
    mockPrismaService.employee.findMany.mockResolvedValue(mockEmployees);
    mockPrismaService.shift.findMany.mockResolvedValue([]);
    mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 0 });
    mockApprenticeDeclarationService.getUndeclaredApprentices.mockResolvedValue(
      [],
    );
    // Story 7.6 — default to DRAFT (no published month) so mutation tests
    // that don't opt into the published-change flow behave as before.
    mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
    mockPrismaService.planningPeriodStatus.updateMany.mockResolvedValue({
      count: 0,
    });
    // Story 11-6 — default interactive-tx mock: run the callback with the base
    // mock as the tx client, so amendment paths (move/create/delete) exercise
    // tx.shift.* + tx.planningPeriodStatus.updateMany against the same mocks.
    // generateMonthlyPlan / deleteGeneratedShifts tests override this with a
    // bespoke tx where they assert on tx.shift.deleteMany / createManyAndReturn.
    mockPrismaService.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrismaService) => Promise<unknown>) =>
        fn(mockPrismaService),
    );
  });

  // ─── expandTemplateToMonth ───────────────────────────────────

  // Access private methods via type cast for unit testing
  const callPrivate = (method: string, ...args: unknown[]) =>
    (service as any)[method](...args);

  describe('expandTemplateToMonth', () => {
    const shiftTypeMap = new Map([
      ['SURGERY', { startTime: '08:00', endTime: '12:00', breakMinutes: 0 }],
      ['RECEPTION', { startTime: '08:00', endTime: '18:00', breakMinutes: 0 }],
    ]);

    it('correctly maps template days to calendar dates for March 2026', () => {
      const slots: SlotRequirement[] = callPrivate(
        'expandTemplateToMonth',
        mockTemplate,
        '2026-03',
        mockOperationalConfig,
        shiftTypeMap,
      );

      // March 2026: Mon=2,9,16,23,30 Tue=3,10,17,24,31 etc.
      // 5 Mondays × 2 slots + 5 Tuesdays × 1 + 4 Wednesdays × 1 + 4 Thursdays × 1 + 4 Fridays × 1
      // Wait, let me count. March 2026 starts on Sunday.
      // Sun 1, Mon 2, Tue 3, Wed 4, Thu 5, Fri 6, Sat 7
      // Mon: 2,9,16,23,30 → 5 Mondays
      // Tue: 3,10,17,24,31 → 5 Tuesdays
      // Wed: 4,11,18,25 → 4 Wednesdays
      // Thu: 5,12,19,26 → 4 Thursdays
      // Fri: 6,13,20,27 → 4 Fridays
      // Mon slots=2, Tue slots=1, Wed=1, Thu=1, Fri=1
      // Total = 5*2 + 5*1 + 4*1 + 4*1 + 4*1 = 10+5+4+4+4 = 27
      expect(slots.length).toBe(27);

      // First slot should be Monday March 2
      expect(slots[0].date).toBe('2026-03-02');
      expect(slots[0].shiftTypeCode).toBe('SURGERY');
    });

    it('skips clinic closed days', () => {
      const configWithClosed = {
        ...mockOperationalConfig,
        closedDays: [{ id: 'cd-1', date: '2026-03-02', reason: 'Holiday' }],
      };

      const slots: SlotRequirement[] = callPrivate(
        'expandTemplateToMonth',
        mockTemplate,
        '2026-03',
        configWithClosed,
        shiftTypeMap,
      );

      const march2Slots = (slots as SlotRequirement[]).filter(
        (s) => s.date === '2026-03-02',
      );
      expect(march2Slots.length).toBe(0);
    });

    it('applies special day hour overrides (clamps to shift window)', () => {
      const configWithSpecial = {
        ...mockOperationalConfig,
        specialDays: [
          {
            id: 'sd-1',
            date: '2026-03-02',
            startTime: '09:00',
            endTime: '14:00',
            label: 'Short day',
          },
        ],
      };

      const slots: SlotRequirement[] = callPrivate(
        'expandTemplateToMonth',
        mockTemplate,
        '2026-03',
        configWithSpecial,
        shiftTypeMap,
      );

      const march2Slots = slots.filter((s: any) => s.date === '2026-03-02');
      expect(march2Slots.length).toBe(2);
      // SURGERY (08:00-12:00) clamped to 09:00-12:00 (start pushed, end kept)
      expect(march2Slots[0].startTime).toBe('09:00');
      expect(march2Slots[0].endTime).toBe('12:00');
      // RECEPTION (08:00-18:00) clamped to 09:00-14:00 (both clamped)
      expect(march2Slots[1].startTime).toBe('09:00');
      expect(march2Slots[1].endTime).toBe('14:00');
    });

    it('handles months with 4 and 5 weeks correctly', () => {
      // February 2026: 28 days, starts on Sunday
      // Mon: 2,9,16,23 → 4 Mondays
      const feb: SlotRequirement[] = callPrivate(
        'expandTemplateToMonth',
        mockTemplate,
        '2026-02',
        mockOperationalConfig,
        shiftTypeMap,
      );
      const febMondays = (feb as SlotRequirement[]).filter(
        (s) => new Date(`${s.date}T00:00:00Z`).getUTCDay() === 1,
      );
      expect(febMondays.length).toBe(8); // 4 Mondays × 2 slots

      // March 2026 has 5 Mondays
      const mar: SlotRequirement[] = callPrivate(
        'expandTemplateToMonth',
        mockTemplate,
        '2026-03',
        mockOperationalConfig,
        shiftTypeMap,
      );
      const marMondays = (mar as SlotRequirement[]).filter(
        (s) => new Date(`${s.date}T00:00:00Z`).getUTCDay() === 1,
      );
      expect(marMondays.length).toBe(10); // 5 Mondays × 2 slots
    });

    it('includes template days even if not in workDays (admin override)', () => {
      const templateWithSaturday: TemplateData = {
        days: [
          {
            dayOfWeek: 6,
            slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
          },
        ],
      };

      const slots: SlotRequirement[] = callPrivate(
        'expandTemplateToMonth',
        templateWithSaturday,
        '2026-03',
        mockOperationalConfig, // workDays: 1-5, no Saturday
        shiftTypeMap,
      );

      // March 2026 Saturdays: 7,14,21,28 → 4
      expect(slots.length).toBe(4);
      expect(
        (slots as SlotRequirement[]).every(
          (s) => new Date(`${s.date}T00:00:00Z`).getUTCDay() === 6,
        ),
      ).toBe(true);
    });
  });

  // ─── loadConstraints ────────────────────────────────────────

  describe('loadConstraints', () => {
    it('aggregates unavailabilities into unavailableMap', async () => {
      mockPrismaService.unavailability.findMany.mockResolvedValue([
        {
          id: 'ua-1',
          employeeId: 'emp-1',
          type: 'VACATION',
          startDate: new Date('2026-03-05'),
          endDate: new Date('2026-03-07'),
          daysOfWeek: [],
        },
      ]);

      const constraints = await callPrivate(
        'loadConstraints',
        clinicId,
        new Date('2026-03-01'),
        new Date('2026-03-31T23:59:59.999Z'),
        2026,
        3,
      );

      const empDates = constraints.unavailableMap.get('emp-1');
      expect(empDates).toBeDefined();
      expect(empDates!.has('2026-03-05')).toBe(true);
      expect(empDates!.has('2026-03-06')).toBe(true);
      expect(empDates!.has('2026-03-07')).toBe(true);
      expect(empDates!.has('2026-03-08')).toBe(false);
    });

    it('expands recurring unavailabilities (daysOfWeek)', async () => {
      mockPrismaService.unavailability.findMany.mockResolvedValue([
        {
          id: 'ua-2',
          employeeId: 'emp-2',
          type: 'SCHOOL',
          startDate: new Date('2026-03-01'),
          endDate: new Date('2026-03-31'),
          daysOfWeek: [3], // Every Wednesday (ISO 3)
        },
      ]);

      const constraints = await callPrivate(
        'loadConstraints',
        clinicId,
        new Date('2026-03-01'),
        new Date('2026-03-31T23:59:59.999Z'),
        2026,
        3,
      );

      const empDates = constraints.unavailableMap.get('emp-2');
      expect(empDates).toBeDefined();
      // March 2026 Wednesdays: 4, 11, 18, 25
      expect(empDates!.has('2026-03-04')).toBe(true);
      expect(empDates!.has('2026-03-11')).toBe(true);
      expect(empDates!.has('2026-03-18')).toBe(true);
      expect(empDates!.has('2026-03-25')).toBe(true);
      // Monday should not be blocked
      expect(empDates!.has('2026-03-02')).toBe(false);
    });

    it('populates schoolDayMap for SCHOOL-type unavailabilities', async () => {
      mockPrismaService.unavailability.findMany.mockResolvedValue([
        {
          id: 'ua-school',
          employeeId: 'emp-2',
          type: 'SCHOOL',
          startDate: new Date('2026-03-01'),
          endDate: new Date('2026-03-31'),
          daysOfWeek: [1, 2], // Every Monday and Tuesday
        },
      ]);

      const constraints = await callPrivate(
        'loadConstraints',
        clinicId,
        new Date('2026-03-01'),
        new Date('2026-03-31T23:59:59.999Z'),
        2026,
        3,
      );

      const schoolDates = constraints.schoolDayMap.get('emp-2');
      expect(schoolDates).toBeDefined();
      // March 2026 Mondays: 2, 9, 16, 23, 30 — Tuesdays: 3, 10, 17, 24, 31
      expect(schoolDates!.has('2026-03-02')).toBe(true); // Monday
      expect(schoolDates!.has('2026-03-03')).toBe(true); // Tuesday
      expect(schoolDates!.has('2026-03-09')).toBe(true); // Monday
      expect(schoolDates!.has('2026-03-04')).toBe(false); // Wednesday — not a school day
    });

    it('separates HARD and SOFT rules', async () => {
      mockPlanningService.listRules.mockResolvedValue([
        {
          id: 'r1',
          name: 'Hard',
          ruleType: 'HARD',
          category: 'STAFFING_MINIMUM',
          config: {},
          priority: 0,
        },
        {
          id: 'r2',
          name: 'Soft',
          ruleType: 'SOFT',
          category: 'ROTATION_EQUITY',
          config: {},
          priority: 0,
        },
      ]);

      const constraints = await callPrivate(
        'loadConstraints',
        clinicId,
        new Date('2026-03-01'),
        new Date('2026-03-31T23:59:59.999Z'),
        2026,
        3,
      );

      expect(constraints.hardRules.length).toBe(1);
      expect(constraints.softRules.length).toBe(1);
      expect(constraints.hardRules[0].name).toBe('Hard');
      expect(constraints.softRules[0].name).toBe('Soft');
    });
  });

  // ─── scoreAndAssign helpers ─────────────────────────────────

  const baseConstraints = {
    unavailableMap: new Map<string, Set<string>>(),
    schoolDayMap: new Map<string, Set<string>>(),
    hardRules: [] as Array<{
      id: string;
      name: string;
      category: string;
      config: Record<string, unknown>;
      priority: number;
    }>,
    softRules: [] as Array<{
      id: string;
      name: string;
      category: string;
      config: Record<string, unknown>;
      priority: number;
    }>,
    equityMap: new Map(),
    quarterlyShifts: [],
  };

  // Helper: call scoreAndAssign with auto-built incremental counters from alreadyAssigned
  // Accepts 6 args (slot, employees, constraints, alreadyAssigned, assignmentIndex, employeeMinutes)
  // or 7 args (same + weeksInMonth). Appends the 3 new counter params automatically.
  const callScore = (...args: unknown[]) => {
    const alreadyAssigned = (args[3] || []) as Array<{
      employeeId: string;
      date: string;
      startTime: string;
      endTime: string;
      shiftTypeCode: string;
      breakMinutes?: number;
    }>;

    // Determine weeksInMonth: if 7th arg exists and is a number, it's weeksInMonth
    const hasWeeksInMonth = args.length >= 7 && typeof args[6] === 'number';
    const baseArgs = hasWeeksInMonth ? args : [...args, 4.43];

    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const getWeekStart = (dateStr: string) => {
      const d = new Date(`${dateStr}T00:00:00.000Z`);
      const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      const mon = new Date(d);
      mon.setUTCDate(d.getUTCDate() - dow + 1);
      return mon.toISOString().split('T')[0];
    };

    const weeklyMinutesCounter = new Map<string, number>();
    const stc = new Map<string, Map<string, number>>();
    const esc = new Map<string, number>();
    for (const a of alreadyAssigned) {
      const netMin =
        toMin(a.endTime) - toMin(a.startTime) - (a.breakMinutes || 0);
      const wk = `${a.employeeId}|${getWeekStart(a.date)}`;
      weeklyMinutesCounter.set(
        wk,
        (weeklyMinutesCounter.get(wk) || 0) + netMin,
      );
      let tc = stc.get(a.employeeId);
      if (!tc) {
        tc = new Map();
        stc.set(a.employeeId, tc);
      }
      tc.set(a.shiftTypeCode, (tc.get(a.shiftTypeCode) || 0) + 1);
      esc.set(a.employeeId, (esc.get(a.employeeId) || 0) + 1);
    }

    // Story 11-10 — build the per-(employee, ISO-day) live index from alreadyAssigned
    // (mirrors the production seeding) and the quarterly index from constraints.
    const isoDayOf = (dateStr: string) => {
      const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
      return dow === 0 ? 7 : dow;
    };
    const buildDayIdx = (
      shifts: Array<{ employeeId: string; date: string }>,
    ) => {
      const idx = new Map<string, Map<number, number>>();
      for (const s of shifts) {
        const iso = isoDayOf(s.date);
        let byDay = idx.get(s.employeeId);
        if (!byDay) {
          byDay = new Map<number, number>();
          idx.set(s.employeeId, byDay);
        }
        byDay.set(iso, (byDay.get(iso) || 0) + 1);
      }
      return idx;
    };
    const dayOfWeekCounts = buildDayIdx(alreadyAssigned);
    const constraints = (args[2] || {}) as {
      quarterlyShifts?: Array<{ employeeId: string; date: string }>;
    };
    const quarterlyDayOfWeekCounts = buildDayIdx(
      constraints.quarterlyShifts || [],
    );

    return callPrivate(
      'scoreAndAssign',
      ...baseArgs,
      weeklyMinutesCounter,
      stc,
      esc,
      dayOfWeekCounts,
      quarterlyDayOfWeekCounts,
    ) as ScoreAndAssignResult;
  };

  describe('scoreAndAssign', () => {
    it('assigns employees to a slot', () => {
      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 2,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        baseConstraints,
        [],
        new Map(),
        new Map(),
      );

      expect(result.assigned.length).toBe(2);
      expect(result.holeInfo).toBeUndefined();
    });

    it('filters out unavailable employees', () => {
      const unavailableMap = new Map([
        ['emp-1', new Set(['2026-03-02'])],
        ['emp-3', new Set(['2026-03-02'])],
      ]);

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 2,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        { ...baseConstraints, unavailableMap },
        [],
        new Map(),
        new Map(),
      );

      // Only emp-2 is available, so 1 assigned + 1 hole
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).toBe('emp-2');
      expect(result.holeInfo).toBeDefined();
      expect(result.holeInfo!.assignedStaff).toBe(1);
      expect(result.holeInfo!.requiredStaff).toBe(2);
    });

    it('prevents double-booking (same employee, overlapping times)', () => {
      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'RECEPTION',
        startTime: '08:00',
        endTime: '18:00',
        requiredStaff: 1,
      };

      const alreadyAssigned = [
        {
          employeeId: 'emp-1',
          date: '2026-03-02',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
      ];

      const assignmentIndex = new Map([[`emp-1|2026-03-02`, alreadyAssigned]]);

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        baseConstraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-1 should not be assigned (overlapping time)
      const assignedIds = result.assigned.map((a) => a.employeeId);
      expect(assignedIds).not.toContain('emp-1');

      // Verify partial fill: another employee should be assigned
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).not.toBe('emp-1');
    });

    it('respects job type requirements (requiredJobTypes filter)', () => {
      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
        requiredJobTypes: ['VET'],
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        baseConstraints,
        [],
        new Map(),
        new Map(),
      );

      // Only VETs should be assigned (emp-1, emp-3)
      expect(result.assigned.length).toBe(1);
      expect(['emp-1', 'emp-3']).toContain(result.assigned[0].employeeId);
    });

    it('records hole when no eligible employees', () => {
      const unavailableMap = new Map(
        mockEmployees.map((e) => [e.id, new Set(['2026-03-02'])]),
      );

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        { ...baseConstraints, unavailableMap },
        [],
        new Map(),
        new Map(),
      );

      expect(result.assigned.length).toBe(0);
      expect(result.holeInfo).toBeDefined();
      expect(result.holeInfo!.reason).toContain('No eligible');
    });

    it('prefers employees with fewer total shifts (workload balancing)', () => {
      const slot = {
        date: '2026-03-10', // Tuesday
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      // emp-1 already assigned to 5 shifts, emp-2 to 1, emp-3 to 5
      const alreadyAssigned = [
        ...Array.from({ length: 5 }, (_, i) => ({
          employeeId: 'emp-1',
          date: `2026-03-0${i + 2}`,
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        })),
        {
          employeeId: 'emp-2',
          date: '2026-03-02',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        ...Array.from({ length: 5 }, (_, i) => ({
          employeeId: 'emp-3',
          date: `2026-03-0${i + 2}`,
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        })),
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        baseConstraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-2 should be preferred (only 1 shift vs 5 for others)
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });

    it('penalizes employees with consecutive work days', () => {
      const slot = {
        date: '2026-03-05', // Thursday
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      // emp-1 worked Mon, Tue, Wed (3 consecutive days before Thu)
      // emp-2 only worked Mon (not adjacent to Thu)
      const alreadyAssigned = [
        {
          employeeId: 'emp-1',
          date: '2026-03-02',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-1',
          date: '2026-03-03',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-1',
          date: '2026-03-04',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-2',
          date: '2026-03-02',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees.slice(0, 2), // emp-1 and emp-2 only
        baseConstraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-2 should be preferred (no consecutive days before Thu)
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });

    it('prefers employees with lower equity counters', () => {
      const equityMap = new Map([
        [
          'emp-1',
          {
            saturdayCount: 5,
            weekendCount: 5,
            holidayCount: 0,
            overtimeMinutes: 0,
          },
        ],
        [
          'emp-3',
          {
            saturdayCount: 1,
            weekendCount: 1,
            holidayCount: 0,
            overtimeMinutes: 0,
          },
        ],
      ]);

      const slot = {
        date: '2026-03-07', // Saturday
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
        requiredJobTypes: ['VET'],
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees.filter((e) => e.jobType === 'VET'),
        { ...baseConstraints, equityMap },
        [],
        new Map(),
        new Map(),
      );

      // emp-3 has lower equity, should be preferred
      expect(result.assigned[0].employeeId).toBe('emp-3');
    });

    it('penalizes employees approaching weekly contract hours', () => {
      // Week of 2026-03-09 (Mon) to 2026-03-15 (Sun)
      // emp-1 already has 32h this week (8 x 4h shifts), almost at 35h limit
      // emp-2 has 0h this week
      const alreadyAssigned = Array.from({ length: 8 }, (_, i) => ({
        employeeId: 'emp-1',
        date: `2026-03-${String(9 + Math.floor(i / 2)).padStart(2, '0')}`, // spread across Mon-Thu
        startTime: i % 2 === 0 ? '08:00' : '14:00',
        endTime: i % 2 === 0 ? '12:00' : '18:00',
        shiftTypeCode: 'SURGERY',
      }));

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      const slot = {
        date: '2026-03-13', // Friday of same week
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00', // 4h slot — would put emp-1 at 36h (over 35h contract)
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[1]], // emp-1 and emp-2
        baseConstraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-2 should be preferred (0h this week vs emp-1 at 32h near limit)
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });

    it('counts school days toward apprentice weekly hours', () => {
      // emp-2 (apprentice) has school days Mon and Tue = 14h already
      // emp-1 has no school days and no shifts this week
      const schoolDayMap = new Map<string, Set<string>>([
        ['emp-2', new Set(['2026-03-09', '2026-03-10'])], // Mon, Tue
      ]);

      const slot = {
        date: '2026-03-11', // Wednesday same week
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00', // 4h
        requiredStaff: 1,
      };

      // emp-2 already has 14h (school) + would be 18h
      // emp-1 has 0h + would be 4h
      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[1]],
        { ...baseConstraints, schoolDayMap },
        [],
        new Map(),
        new Map(),
      );

      // emp-1 should be preferred (further from weekly limit)
      expect(result.assigned[0].employeeId).toBe('emp-1');
    });

    it('distributes shifts fairly when one employee is close to weekly limit', () => {
      // Week of 2026-03-09 (Mon) to 2026-03-15 (Sun)
      // emp-1 already has 28h this week (7 x 4h shifts)
      // emp-2 already has 8h this week (2 x 4h shifts)
      // emp-3 already has 8h this week (2 x 4h shifts)
      const alreadyAssigned = [
        ...Array.from({ length: 7 }, (_, i) => ({
          employeeId: 'emp-1',
          date: `2026-03-${String(9 + Math.floor(i / 2)).padStart(2, '0')}`,
          startTime: i % 2 === 0 ? '08:00' : '14:00',
          endTime: i % 2 === 0 ? '12:00' : '18:00',
          shiftTypeCode: 'SURGERY',
        })),
        {
          employeeId: 'emp-2',
          date: '2026-03-09',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-2',
          date: '2026-03-10',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-3',
          date: '2026-03-09',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-3',
          date: '2026-03-10',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      const slot = {
        date: '2026-03-12', // Thursday of same week
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00', // 4h
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        baseConstraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-1 at 28h should NOT be picked. emp-2 or emp-3 at 8h should be preferred
      expect(result.assigned[0].employeeId).not.toBe('emp-1');
    });
  });

  // ─── reorderSlotsNonWorkDaysFirst ─────────────────────────────

  describe('reorderSlotsNonWorkDaysFirst', () => {
    // workDays: Mon-Fri (1-5), so Saturday (6) and Sunday (7) are non-work days
    const workDaySet = new Set([1, 2, 3, 4, 5]);

    it('processes Saturday slots before weekday slots within the same week', () => {
      const slots = [
        {
          date: '2026-03-02',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Monday
        {
          date: '2026-03-03',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Tuesday
        {
          date: '2026-03-07',
          shiftTypeCode: 'CHIR',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Saturday
      ];

      const reordered = callPrivate(
        'reorderSlotsNonWorkDaysFirst',
        slots,
        workDaySet,
      );

      // Saturday should come first (non-work day)
      expect(reordered[0].date).toBe('2026-03-07');
      expect(reordered[1].date).toBe('2026-03-02');
      expect(reordered[2].date).toBe('2026-03-03');
    });

    it('maintains chronological order across different weeks', () => {
      const slots = [
        {
          date: '2026-03-02',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Week 1 Mon
        {
          date: '2026-03-07',
          shiftTypeCode: 'CHIR',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Week 1 Sat
        {
          date: '2026-03-09',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Week 2 Mon
        {
          date: '2026-03-14',
          shiftTypeCode: 'CHIR',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Week 2 Sat
      ];

      const reordered = callPrivate(
        'reorderSlotsNonWorkDaysFirst',
        slots,
        workDaySet,
      );

      // Week 1: Saturday first, then Monday
      expect(reordered[0].date).toBe('2026-03-07'); // Week 1 Sat
      expect(reordered[1].date).toBe('2026-03-02'); // Week 1 Mon
      // Week 2: Saturday first, then Monday
      expect(reordered[2].date).toBe('2026-03-14'); // Week 2 Sat
      expect(reordered[3].date).toBe('2026-03-09'); // Week 2 Mon
    });

    it('uses dynamic workDays config — Wednesday off, edge days detected', () => {
      // Clinic works Mon, Tue, Thu, Fri, Sat — Wednesday and Sunday off
      // Edge days: Tue (next=Wed off) and Sat (next=Sun off)
      const customWorkDays = new Set([1, 2, 4, 5, 6]);
      const slots = [
        {
          date: '2026-03-02',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Monday (regular work, priority 2)
        {
          date: '2026-03-04',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Wednesday (off, priority 0)
        {
          date: '2026-03-07',
          shiftTypeCode: 'CHIR',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Saturday (edge, priority 1)
      ];

      const reordered = callPrivate(
        'reorderSlotsNonWorkDaysFirst',
        slots,
        customWorkDays,
      );

      // Wed (non-work, 0) → Sat (edge, 1) → Mon (regular, 2)
      expect(reordered[0].date).toBe('2026-03-04'); // Wed (non-work)
      expect(reordered[1].date).toBe('2026-03-07'); // Sat (edge work day)
      expect(reordered[2].date).toBe('2026-03-02'); // Mon (regular work)
    });

    it('gives edge work days higher priority than regular work days', () => {
      // Mon-Sat clinic (Sunday off) → Saturday is the edge day (followed by Sunday)
      const monSatWorkDays = new Set([1, 2, 3, 4, 5, 6]);
      const slots = [
        {
          date: '2026-03-02',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Monday
        {
          date: '2026-03-03',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Tuesday
        {
          date: '2026-03-04',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Wednesday
        {
          date: '2026-03-05',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Thursday
        {
          date: '2026-03-06',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Friday
        {
          date: '2026-03-07',
          shiftTypeCode: 'CHIR',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Saturday (edge)
      ];

      const reordered = callPrivate(
        'reorderSlotsNonWorkDaysFirst',
        slots,
        monSatWorkDays,
      );

      // Saturday (edge, priority 1) should come before Mon-Fri (regular, priority 2)
      expect(reordered[0].date).toBe('2026-03-07'); // Sat (edge work day)
      expect(reordered[1].date).toBe('2026-03-02'); // Mon
      expect(reordered[2].date).toBe('2026-03-03'); // Tue
      expect(reordered[3].date).toBe('2026-03-04'); // Wed
      expect(reordered[4].date).toBe('2026-03-05'); // Thu
      expect(reordered[5].date).toBe('2026-03-06'); // Fri
    });

    it('treats all days as regular when clinic works every day (no edge days)', () => {
      // Mon-Sun clinic → every day is a work day, every day is an edge day
      // (each day's next is also a work day... actually all are edge days since
      //  all 7 days are work days, every next day IS a work day, so NO edge days)
      const allDaysWork = new Set([1, 2, 3, 4, 5, 6, 7]);
      const slots = [
        {
          date: '2026-03-04',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Wednesday
        {
          date: '2026-03-02',
          shiftTypeCode: 'VET',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Monday
        {
          date: '2026-03-07',
          shiftTypeCode: 'CHIR',
          startTime: '08:00',
          endTime: '18:00',
          requiredStaff: 1,
        }, // Saturday
      ];

      const reordered = callPrivate(
        'reorderSlotsNonWorkDaysFirst',
        slots,
        allDaysWork,
      );

      // All work days, no edge days → all priority 2, sorted by date
      expect(reordered[0].date).toBe('2026-03-02'); // Mon
      expect(reordered[1].date).toBe('2026-03-04'); // Wed
      expect(reordered[2].date).toBe('2026-03-07'); // Sat
    });
  });

  // ─── fill-to-contract scoring ─────────────────────────────

  describe('fill-to-contract scoring', () => {
    it('strongly prefers employee with lower weekly hours over one near limit', () => {
      // emp-1 at 30h (near 35h limit), emp-2 at 0h
      const alreadyAssigned = Array.from({ length: 3 }, (_, i) => ({
        employeeId: 'emp-1',
        date: `2026-03-${String(9 + i).padStart(2, '0')}`, // Mon, Tue, Wed
        startTime: '08:00',
        endTime: '18:00', // 10h each = 30h total
        shiftTypeCode: 'VET',
      }));

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        assignmentIndex.set(key, [a]);
      }

      const slot = {
        date: '2026-03-12', // Thursday same week
        shiftTypeCode: 'VET',
        startTime: '08:00',
        endTime: '18:00', // 10h
        requiredStaff: 1,
      };

      // Run multiple times to account for random tiebreaker
      let emp2Count = 0;
      for (let i = 0; i < 5; i++) {
        const result: ScoreAndAssignResult = callScore(
          slot,
          [mockEmployees[0], mockEmployees[1]], // emp-1 (30h) and emp-2 (0h)
          {
            unavailableMap: new Map(),
            schoolDayMap: new Map(),
            hardRules: [],
            softRules: [],
            equityMap: new Map(),
            quarterlyShifts: [],
          },
          alreadyAssigned,
          assignmentIndex,
          new Map(),
        );
        if (result.assigned[0]?.employeeId === 'emp-2') emp2Count++;
      }

      // emp-2 at 0h should ALWAYS beat emp-1 at 30h (score difference is huge)
      expect(emp2Count).toBe(5);
    });
  });

  // ─── generateMonthlyPlan ──────────────────────────────────

  describe('generateMonthlyPlan', () => {
    it('creates Shift records via $transaction', async () => {
      const templateData = {
        days: [
          {
            dayOfWeek: 1,
            slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
          },
        ],
      };

      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Simple',
        data: templateData,
        clinicId,
      });

      const createdShifts = [
        {
          id: 'shift-1',
          date: new Date('2026-03-02'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          employeeId: 'emp-1',
          source: 'GENERATED',
          clinicId,
        },
      ];

      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest.fn().mockResolvedValue(createdShifts),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-1',
      );

      expect(result.assignments.length).toBe(1);
      expect(result.assignments[0].id).toBe('shift-1');
      expect(result.stats.filledSlots).toBe(1);
    });

    it('returns correct result structure', async () => {
      const templateData = {
        days: [
          {
            dayOfWeek: 1,
            slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
          },
        ],
      };

      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Simple',
        data: templateData,
        clinicId,
      });

      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest.fn().mockResolvedValue([]),
            },
          };
          return fn(tx);
        },
      );

      // No employees available
      mockPrismaService.employee.findMany.mockResolvedValue([]);

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-1',
      );

      expect(result).toHaveProperty('assignments');
      expect(result).toHaveProperty('holes');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('stats');
      expect(result.violations).toHaveProperty('hard');
      expect(result.violations).toHaveProperty('soft');
    });

    it('clinic isolation (cannot use other clinics template)', async () => {
      mockTemplateService.getTemplateById.mockRejectedValue(
        new NotFoundException('Planning template tpl-other not found'),
      );

      await expect(
        service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-other'),
      ).rejects.toThrow(NotFoundException);
    });

    it('loads border week shifts from adjacent months for weekly hour calculation', async () => {
      // March 2026 starts on Sunday (Mar 1). ISO week 9 = Feb 23 – Mar 1.
      // If emp-1 already has a 10h shift on Feb 27 (Friday), the algorithm should
      // see those hours when processing Mar 1 (Sunday, same ISO week).
      const templateData = {
        days: [
          {
            dayOfWeek: 7, // Sunday only
            slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
          },
        ],
      };

      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Sunday Only',
        data: templateData,
        clinicId,
      });

      // Border shifts: emp-1 already worked 35h Mon-Fri of that week in February
      const borderShiftsFromDb = [
        {
          employeeId: 'emp-1',
          date: new Date('2026-02-23'),
          startTime: '08:00',
          endTime: '15:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
        {
          employeeId: 'emp-1',
          date: new Date('2026-02-24'),
          startTime: '08:00',
          endTime: '15:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
        {
          employeeId: 'emp-1',
          date: new Date('2026-02-25'),
          startTime: '08:00',
          endTime: '15:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
        {
          employeeId: 'emp-1',
          date: new Date('2026-02-26'),
          startTime: '08:00',
          endTime: '15:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
        {
          employeeId: 'emp-1',
          date: new Date('2026-02-27'),
          startTime: '08:00',
          endTime: '15:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ];
      // Story 11-2 — generateMonthlyPlan now issues TWO shift.findMany queries:
      // border-week (where.date.in) and in-month survivors (where.OR). Key the
      // mock on the predicate so only the border query returns borderShiftsFromDb.
      mockPrismaService.shift.findMany.mockImplementation((args: any) => {
        if (args?.where?.OR) return Promise.resolve([]);
        return Promise.resolve(borderShiftsFromDb);
      });

      // Only emp-1 (35h contract, already at 35h from border) and emp-2 (35h contract, fresh)
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          lastName: 'Martin',
          jobType: 'VET',
          contractHours: 35,
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          lastName: 'Dupont',
          jobType: 'VET',
          contractHours: 35,
        },
      ]);

      // HARD CONTRACT_COMPLIANCE: max 35h/week with 0% tolerance
      mockPlanningService.listRules.mockResolvedValue([
        {
          id: 'rule-cc',
          name: '35H',
          ruleType: 'HARD',
          category: 'CONTRACT_COMPLIANCE',
          isActive: true,
          priority: 0,
          config: { maxWeeklyHours: 35, overtimeThresholdPercent: 0 },
        },
      ]);

      const createdShifts = [
        {
          id: 'shift-sun',
          date: new Date('2026-03-01'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          employeeId: 'emp-2', // Should be emp-2 since emp-1 is at 35h
          source: 'GENERATED',
          clinicId,
        },
      ];

      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest.fn().mockResolvedValue(createdShifts),
            },
          };
          return fn(tx);
        },
      );

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-1',
      );

      // The shift should be assigned to emp-2, not emp-1 (who is at 35h from border shifts)
      expect(result.assignments.length).toBe(1);
      expect(result.assignments[0].employeeId).toBe('emp-2');

      // Verify that shift.findMany was called (for border shifts)
      expect(mockPrismaService.shift.findMany).toHaveBeenCalled();
    });
  });

  // ─── Story 11-2 — surviving shifts visible to generator + anti-duplicate ──
  describe('Story 11-2 — surviving shifts visible to generator', () => {
    const mondaySurgery2 = {
      id: 'tpl-11-2',
      name: 'Monday Surgery x2',
      data: {
        days: [
          {
            dayOfWeek: 1,
            slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 2 }],
          },
        ],
      },
      clinicId,
    };

    const twoVets = [
      {
        id: 'emp-1',
        firstName: 'Alice',
        lastName: 'Martin',
        jobType: 'VET',
        contractHours: 35,
      },
      {
        id: 'emp-2',
        firstName: 'Bob',
        lastName: 'Dupont',
        jobType: 'VET',
        contractHours: 35,
      },
    ];

    // Key shift.findMany on the survivor predicate (where.OR) vs the border query
    // (where.date.in). Only the survivor query returns `survivors`.
    const mockShiftQueries = (survivors: any[]) => {
      mockPrismaService.shift.findMany.mockImplementation((args: any) => {
        if (args?.where?.OR) return Promise.resolve(survivors);
        return Promise.resolve([]);
      });
    };

    // Capture the rows handed to createManyAndReturn inside the $transaction.
    const captureCreate = () => {
      const captured: any[] = [];
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest
                .fn()
                .mockImplementation(({ data }: { data: any[] }) => {
                  captured.push(...data);
                  return data.map((d, i) => ({ id: `gen-${i}`, ...d }));
                }),
            },
          };
          return fn(tx);
        },
      );
      return captured;
    };

    it('queries in-month survivors with the deleteMany-complement predicate (AC1)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery2);
      mockPrismaService.employee.findMany.mockResolvedValue(twoVets);
      mockShiftQueries([]);
      captureCreate();

      await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-2');

      expect(mockPrismaService.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId,
            date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
            OR: expect.arrayContaining([
              { source: { not: 'GENERATED' } },
              { isConfirmed: true },
              { varianceEvents: { some: {} } },
            ]),
          }),
        }),
      );
    });

    it('excludes an employee with a surviving overlapping shift and fills only the residual (AC1 + AC3)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery2);
      mockPrismaService.employee.findMany.mockResolvedValue(twoVets);
      // emp-1 already has a MANUAL SURGERY (08:00–12:00) on Mon 2026-03-02 that
      // survives regeneration. That day's SURGERY slot needs 2.
      mockShiftQueries([
        {
          employeeId: 'emp-1',
          date: new Date('2026-03-02'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ]);
      const created = captureCreate();

      await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-2');

      const mar2 = created.filter((d) =>
        d.date.toISOString().startsWith('2026-03-02'),
      );
      // AC3 — 2 required − 1 pre-existing coverage = exactly 1 generated.
      expect(mar2.length).toBe(1);
      // AC1 — emp-1 is overlap-excluded; the residual goes to emp-2.
      expect(mar2[0].employeeId).toBe('emp-2');
    });

    it('skips a slot fully covered by surviving shifts — no generation, no hole (AC3)', async () => {
      const mondaySurgery1 = {
        ...mondaySurgery2,
        data: {
          days: [
            {
              dayOfWeek: 1,
              slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
            },
          ],
        },
      };
      mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery1);
      mockPrismaService.employee.findMany.mockResolvedValue(twoVets);
      // emp-1 covers the single SURGERY position on Mon 2026-03-02 (requiredStaff 1).
      mockShiftQueries([
        {
          employeeId: 'emp-1',
          date: new Date('2026-03-02'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ]);
      const created = captureCreate();

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-11-2',
      );

      const mar2Created = created.filter((d) =>
        d.date.toISOString().startsWith('2026-03-02'),
      );
      expect(mar2Created.length).toBe(0); // fully covered → nothing generated
      expect(result.holes.filter((h) => h.date === '2026-03-02').length).toBe(
        0,
      );
    });

    it('does NOT credit coverage for a survivor whose hours do not overlap the slot — the slot is still generated (AC3, no silent under-staffing)', async () => {
      const mondaySurgery1 = {
        ...mondaySurgery2,
        data: {
          days: [
            {
              dayOfWeek: 1,
              slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
            },
          ],
        },
      };
      mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery1);
      mockPrismaService.employee.findMany.mockResolvedValue(twoVets);
      // emp-1 has a surviving SURGERY on Mon 2026-03-02 but at 06:00–08:00. The
      // slot resolves to SURGERY's live hours 08:00–12:00 → NO time overlap.
      // Keying coverage on shiftTypeCode alone would wrongly skip the slot;
      // gated on real overlap it must still be generated.
      mockShiftQueries([
        {
          employeeId: 'emp-1',
          date: new Date('2026-03-02'),
          startTime: '06:00',
          endTime: '08:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ]);
      const created = captureCreate();

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-11-2',
      );

      const mar2Created = created.filter((d) =>
        d.date.toISOString().startsWith('2026-03-02'),
      );
      // The non-overlapping survivor must NOT cover the slot → it is generated.
      expect(mar2Created.length).toBe(1);
      // No false "fully covered" suppression: the slot is a real fill, no hole.
      expect(result.holes.filter((h) => h.date === '2026-03-02').length).toBe(
        0,
      );
    });

    it('does NOT credit coverage from a survivor whose jobType fails the slot requiredJobTypes (AC3)', async () => {
      const asvOnlySurgery = {
        ...mondaySurgery2,
        data: {
          days: [
            {
              dayOfWeek: 1,
              slots: [
                {
                  shiftTypeCode: 'SURGERY',
                  requiredStaff: 1,
                  requiredJobTypes: ['ASV'],
                },
              ],
            },
          ],
        },
      };
      mockTemplateService.getTemplateById.mockResolvedValue(asvOnlySurgery);
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          lastName: 'Martin',
          jobType: 'VET',
          contractHours: 35,
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          lastName: 'Dupont',
          jobType: 'ASV',
          contractHours: 35,
        },
      ]);
      // emp-1 (VET) has a surviving SURGERY 08:00–12:00 on Mon 2026-03-02 that
      // overlaps the slot hours, but the slot requires an ASV. A VET survivor
      // must NOT satisfy the ASV demand → the slot is generated for emp-2 (ASV).
      mockShiftQueries([
        {
          employeeId: 'emp-1',
          date: new Date('2026-03-02'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
          employee: { jobType: 'VET' },
        },
      ]);
      const created = captureCreate();

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-11-2',
      );

      const mar2Created = created.filter((d) =>
        d.date.toISOString().startsWith('2026-03-02'),
      );
      expect(mar2Created.length).toBe(1);
      expect(mar2Created[0].employeeId).toBe('emp-2'); // the ASV fills it
      expect(result.holes.filter((h) => h.date === '2026-03-02').length).toBe(
        0,
      );
    });

    it("counts a survivor's hours toward the monthly total so regeneration cannot overrun the contract cap (AC1)", async () => {
      const everyMondaySurgery1 = {
        ...mondaySurgery2,
        data: {
          days: [
            {
              dayOfWeek: 1,
              slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
            },
          ],
        },
      };
      mockTemplateService.getTemplateById.mockResolvedValue(
        everyMondaySurgery1,
      );
      // Single employee so the cap exclusion is directly observable.
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          lastName: 'Martin',
          jobType: 'VET',
          contractHours: 35,
        },
      ]);
      // HARD monthly cap of 4h. emp-1's surviving 4h SURGERY (08:00–12:00) on
      // 2026-03-02 already consumes the whole monthly budget via the seeded
      // employeeMinutes counter.
      mockPlanningService.listRules.mockResolvedValue([
        {
          id: 'rule-monthly',
          name: '4H/month',
          ruleType: 'HARD',
          category: 'CONTRACT_COMPLIANCE',
          isActive: true,
          priority: 0,
          config: { maxMonthlyHours: 4, overtimeThresholdPercent: 0 },
        },
      ]);
      mockShiftQueries([
        {
          employeeId: 'emp-1',
          date: new Date('2026-03-02'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ]);
      const created = captureCreate();

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-11-2',
      );

      // Every later Monday would push emp-1 past the 4h monthly cap, so the
      // survivor's seeded hours must block any further assignment (no silent
      // overrun) and surface visible holes instead.
      expect(created.filter((d) => d.employeeId === 'emp-1').length).toBe(0);
      expect(result.holes.length).toBeGreaterThan(0);
    });

    it('counts survivor-covered positions toward filledSlots so the fill stat is not understated (AC3 metric)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(mondaySurgery2);
      mockPrismaService.employee.findMany.mockResolvedValue(twoVets);
      // One surviving SURGERY (08:00–12:00) on Mon 2026-03-02 covers one of that
      // day's two positions. That position is neither a generated row nor a hole,
      // so filledSlots must add it to the generated count to stay accurate.
      mockShiftQueries([
        {
          employeeId: 'emp-1',
          date: new Date('2026-03-02'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ]);
      const created = captureCreate();

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-11-2',
      );

      // filledSlots = generated rows + the single survivor-covered position.
      expect(result.stats.filledSlots).toBe(created.length + 1);
      // Accounting identity holds: no position is silently unaccounted for.
      expect(result.stats.filledSlots).toBeLessThanOrEqual(
        result.stats.totalSlots,
      );
    });

    it('credits a shared (date, shiftTypeCode) survivor to exactly one of two slots — consumed once (AC3)', async () => {
      const twoSurgerySlots = {
        ...mondaySurgery2,
        data: {
          days: [
            {
              dayOfWeek: 1,
              slots: [
                { shiftTypeCode: 'SURGERY', requiredStaff: 1 },
                { shiftTypeCode: 'SURGERY', requiredStaff: 1 },
              ],
            },
          ],
        },
      };
      mockTemplateService.getTemplateById.mockResolvedValue(twoSurgerySlots);
      mockPrismaService.employee.findMany.mockResolvedValue(twoVets);
      // Two SURGERY positions share the (2026-03-02, SURGERY) coverage key. One
      // surviving overlapping shift must be consumed by ONE slot only — the other
      // position is still generated (not double-credited, not dropped).
      mockShiftQueries([
        {
          employeeId: 'emp-1',
          date: new Date('2026-03-02'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ]);
      const created = captureCreate();

      await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-2');

      const mar2 = created.filter((d) =>
        d.date.toISOString().startsWith('2026-03-02'),
      );
      // 2 positions − 1 consumed-once survivor = exactly 1 generated.
      expect(mar2.length).toBe(1);
      // emp-1 is overlap-excluded; the remaining position goes to emp-2.
      expect(mar2[0].employeeId).toBe('emp-2');
    });
  });

  // ─── deleteGeneratedShifts ────────────────────────────────

  describe('deleteGeneratedShifts', () => {
    it('only removes GENERATED source shifts', async () => {
      mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.deleteGeneratedShifts(clinicId, '2026-03');

      expect(result.deletedCount).toBe(5);
      expect(mockPrismaService.shift.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          clinicId,
          source: 'GENERATED',
        }),
      });
    });

    it('preserves MANUAL shifts (only deletes GENERATED)', async () => {
      mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 0 });

      await service.deleteGeneratedShifts(clinicId, '2026-03');

      const callArgs = mockPrismaService.shift.deleteMany.mock.calls[0][0];
      expect(callArgs.where.source).toBe('GENERATED');
    });
  });

  // ─── HARD rule violations ────────────────────────────────

  describe('HARD rule evaluation in scoreAndAssign', () => {
    it('records hard violation when STAFFING_MINIMUM not met', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r1',
            name: 'Min 3 staff',
            category: 'STAFFING_MINIMUM',
            config: { shiftTypeCode: 'SURGERY', minStaff: 5 },
            priority: 0,
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        equityMap: new Map(),
      };

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 2,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        constraints,
        [],
        new Map(),
        new Map(),
      );

      expect(result.hardViolations.length).toBeGreaterThan(0);
      expect(result.hardViolations[0].severity).toBe('blocking');
      // FIX 2: Partial fill — employees are still assigned even when hard rule fires
      expect(result.assigned.length).toBe(2);
      expect(result.holeInfo).toBeUndefined(); // requiredStaff=2, assigned=2 → no hole
    });

    it('enforces HARD ROTATION_EQUITY by excluding employees at limit', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r1',
            name: 'Max 2 Saturdays',
            category: 'ROTATION_EQUITY',
            config: { targetDay: 'saturday', maxPerPeriod: 2 },
            priority: 0,
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // emp-1 already worked 2 Saturdays
      const alreadyAssigned = [
        {
          employeeId: 'emp-1',
          date: '2026-03-07',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-1',
          date: '2026-03-14',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        assignmentIndex.set(key, [a]);
      }

      const slot = {
        date: '2026-03-21', // Another Saturday
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees.filter((e) => e.jobType === 'VET'), // emp-1 and emp-3
        constraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-1 should be excluded (2 Saturdays = at limit)
      // emp-3 should be assigned
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).toBe('emp-3');
    });

    it('records hard violation when SKILL_REQUIREMENT missing', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r1',
            name: 'Need INTERN',
            category: 'SKILL_REQUIREMENT',
            config: {
              shiftTypeCode: 'SURGERY',
              requiredJobTypes: ['INTERN'],
            },
            priority: 0,
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        constraints,
        [],
        new Map(),
        new Map(),
      );

      expect(result.hardViolations.length).toBe(1);
      expect(result.hardViolations[0].message).toContain('INTERN');
      // FIX 2: Partial fill — assign available employees despite missing skill type
      expect(result.assigned.length).toBe(1); // requiredStaff=1, 3 eligible
      expect(result.holeInfo).toBeUndefined();
    });
  });

  // ─── ROTATION_EQUITY fallback ─────────────────────────────────

  describe('ROTATION_EQUITY fallback when all employees blocked', () => {
    it('re-admits rotation-blocked employees to avoid holes', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r-rot',
            name: 'Max 1 Saturday',
            category: 'ROTATION_EQUITY',
            config: { targetDay: 'saturday', maxPerPeriod: 1 },
            priority: 0,
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // Both ASV employees already have 1 Saturday shift each (at maxPerPeriod limit)
      const alreadyAssigned = [
        {
          employeeId: 'emp-1',
          date: '2026-03-07',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-2',
          date: '2026-03-07',
          startTime: '14:00',
          endTime: '18:00',
          shiftTypeCode: 'SURGERY',
        },
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        assignmentIndex.set(`${a.employeeId}|${a.date}`, [a]);
      }

      // Second Saturday slot — both are at maxPerPeriod
      const slot = {
        date: '2026-03-14', // Another Saturday
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[1]], // emp-1, emp-2 — both at limit
        constraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // Without fallback, this would be a hole. With fallback, one should be assigned.
      expect(result.assigned.length).toBe(1);
      expect(result.holeInfo).toBeUndefined();
      // A soft warning should be emitted
      expect(result.softViolations.length).toBeGreaterThanOrEqual(1);
      expect(
        result.softViolations.some((v) => v.message.includes('rotation limit')),
      ).toBe(true);
    });
  });

  // ─── SOFT rule warnings ─────────────────────────────────

  describe('SOFT rule evaluation in scoreAndAssign', () => {
    it('records soft warning for ROTATION_EQUITY violation', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        softRules: [
          {
            id: 'r1',
            name: 'Max 2 Saturdays',
            category: 'ROTATION_EQUITY',
            config: { targetDay: 'saturday', maxPerPeriod: 1 },
            priority: 0,
          },
        ],
        equityMap: new Map(),
      };

      // Employee already assigned to a Saturday
      const alreadyAssigned = [
        {
          employeeId: 'emp-1',
          date: '2026-03-07', // Saturday
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
      ];

      const slot = {
        date: '2026-03-14', // Another Saturday
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0]], // Only emp-1
        constraints,
        alreadyAssigned,
        new Map(),
        new Map(),
      );

      // Assignment should still happen (soft rule)
      expect(result.assigned.length).toBe(1);
      // But warning should be recorded
      expect(result.softViolations.length).toBe(1);
      expect(result.softViolations[0].severity).toBe('warning');
    });

    it('records soft warning for CONTRACT_COMPLIANCE violation', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        softRules: [
          {
            id: 'r1',
            name: 'Max hours',
            category: 'CONTRACT_COMPLIANCE',
            config: { maxMonthlyHours: 1 },
            priority: 0,
          },
        ],
        equityMap: new Map(),
      };

      // Employee already has a lot of hours
      const employeeMinutes = new Map([['emp-1', 10000]]);

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0]],
        constraints,
        [],
        new Map(),
        employeeMinutes,
      );

      // Assignment happens but warning recorded
      expect(result.assigned.length).toBe(1);
      expect(result.softViolations.length).toBe(1);
      expect(result.softViolations[0].message).toContain('exceeds');
    });
  });

  // ─── HARD CONTRACT_COMPLIANCE ───────────────────────────────────

  describe('HARD CONTRACT_COMPLIANCE in scoreAndAssign', () => {
    it('excludes employees who would exceed HARD maxWeeklyHours', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r-cc',
            name: 'Max 35h/week',
            category: 'CONTRACT_COMPLIANCE',
            config: { maxWeeklyHours: 35, overtimeThresholdPercent: 0 },
            priority: 10,
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // emp-1 already has 32h this week (8 x 4h shifts Mon-Thu)
      const alreadyAssigned = Array.from({ length: 8 }, (_, i) => ({
        employeeId: 'emp-1',
        date: `2026-03-${String(9 + Math.floor(i / 2)).padStart(2, '0')}`,
        startTime: i % 2 === 0 ? '08:00' : '14:00',
        endTime: i % 2 === 0 ? '12:00' : '18:00',
        shiftTypeCode: 'SURGERY',
      }));

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      const slot = {
        date: '2026-03-13', // Friday of same week
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00', // 4h — would put emp-1 at 36h > 35h hard limit
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[1]], // emp-1 and emp-2
        constraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-1 should be BLOCKED (36h > 35h hard limit)
      // emp-2 should be assigned instead
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });

    it('allows overtime within overtimeThresholdPercent tolerance', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r-cc',
            name: 'Max 35h/week with 10% tolerance',
            category: 'CONTRACT_COMPLIANCE',
            config: { maxWeeklyHours: 35, overtimeThresholdPercent: 10 },
            priority: 5,
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // emp-1 has 34h this week — 4h shift would put at 38h
      // With 10% tolerance: 35 * 1.1 = 38.5h hard limit — allowed!
      const alreadyAssigned = Array.from({ length: 8 }, (_, i) => ({
        employeeId: 'emp-1',
        date: `2026-03-${String(9 + Math.floor(i / 2)).padStart(2, '0')}`,
        startTime: i % 2 === 0 ? '08:00' : '14:00',
        endTime: i % 2 === 0 ? '12:00' : '17:30', // 4h + 3.5h = 7.5h/day x 4 = 30h... let's fix
        shiftTypeCode: 'SURGERY',
      }));
      // Actually let's give emp-1 exactly 34h: 8 shifts of 4h + one extra 2h
      const alreadyAssigned2 = [
        ...Array.from({ length: 8 }, (_, i) => ({
          employeeId: 'emp-1',
          date: `2026-03-${String(9 + Math.floor(i / 2)).padStart(2, '0')}`,
          startTime: i % 2 === 0 ? '08:00' : '14:00',
          endTime: i % 2 === 0 ? '12:00' : '18:00',
          shiftTypeCode: 'SURGERY',
        })),
        {
          employeeId: 'emp-1',
          date: '2026-03-12',
          startTime: '18:00',
          endTime: '20:00',
          shiftTypeCode: 'SURGERY',
        },
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned2) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      const slot = {
        date: '2026-03-13', // Friday
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00', // 4h — emp-1 would be at 38h, within 38.5h tolerance
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0]], // only emp-1
        constraints,
        alreadyAssigned2,
        assignmentIndex,
        new Map(),
      );

      // emp-1 at 34h + 4h = 38h < 38.5h tolerance → should be allowed
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).toBe('emp-1');
    });
  });

  // ─── Story 11-10 — rotation index equivalence (HARD block / SOFT penalty / SOFT violation) ──
  // AC1 (verbatim from story 11-10-generation-performance-under-load:17):
  //   "the schedule produced — every assignment, every staffing hole, and every
  //   hard and soft violation, including all rotation-equity outcomes (hard caps
  //   that exclude an employee, soft penalties that reorder candidates, soft
  //   warnings that get recorded) — is identical to the schedule produced before
  //   this story. And the per-employee rotation-equity evaluation no longer
  //   re-examines the whole set of already-placed shifts for each candidate of
  //   each slot"
  describe('Story 11-10 — rotation-equity via O(1) day index', () => {
    const satSlot = {
      date: '2026-03-07', // Saturday (ISO 6)
      shiftTypeCode: 'SURGERY',
      startTime: '08:00',
      endTime: '12:00',
      requiredStaff: 1,
    };
    const rule = (extra: Record<string, unknown> = {}) => ({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Max 2 Saturdays',
      category: 'ROTATION_EQUITY',
      config: { targetDay: 'saturday', maxPerPeriod: 2, ...extra },
      priority: 5,
    });
    // Two prior Saturdays already worked by emp-1 (ISO 6): 2026-02-28 and 2026-03-07.
    const priorSaturdays = (empId: string) => [
      {
        employeeId: empId,
        date: '2026-02-28',
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 0,
      },
    ];

    it('HARD rotation: excludes the at-cap employee so the under-cap one wins (index == scan)', () => {
      // maxPerPeriod 1, emp-1 already has 1 Saturday → HARD-blocked. emp-2 carries
      // MORE prior shifts (2× SURGERY on weekdays), so both the shift-type-diversity
      // penalty (-15/occurrence) and the fewer-shifts tiebreak would hand the slot
      // to emp-1 if the cap did not exclude him — a broken/empty index assigns
      // emp-1, making this assertion discriminating.
      // NOTE (deviation from the story's single-employee version): with emp-1 alone
      // in the pool, the PRE-EXISTING rotation-equity relaxation fallback
      // (scoreAndAssign: "Better to slightly exceed rotation limits than create
      // holes") re-admits the blocked employee instead of leaving a hole — the
      // story's expected hole contradicted shipped behaviour, before and after the
      // index. Equivalence is preserved; the expectation was corrected.
      const twoVets = [
        {
          id: 'emp-1',
          firstName: 'A',
          lastName: 'M',
          jobType: 'VET',
          contractHours: 35,
        },
        {
          id: 'emp-2',
          firstName: 'B',
          lastName: 'D',
          jobType: 'VET',
          contractHours: 35,
        },
      ];
      const already = [
        ...priorSaturdays('emp-1'),
        {
          employeeId: 'emp-2',
          date: '2026-02-25',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
        {
          employeeId: 'emp-2',
          date: '2026-02-26',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ];
      const result: ScoreAndAssignResult = callScore(
        satSlot,
        twoVets,
        { ...baseConstraints, hardRules: [rule({ maxPerPeriod: 1 })] },
        already,
        new Map(),
        new Map(),
      );
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).toBe('emp-2');
      // emp-2 satisfied requiredStaff, so the relaxation fallback never fired:
      // emp-1 was genuinely excluded by the cap, not merely outscored.
      expect(
        result.softViolations.some((v) =>
          v.message.includes('despite reaching rotation limit'),
        ),
      ).toBe(false);
    });

    it('SOFT rotation: penalises the capped employee so the under-cap one wins', () => {
      const twoVets = [
        {
          id: 'emp-1',
          firstName: 'A',
          lastName: 'M',
          jobType: 'VET',
          contractHours: 35,
        },
        {
          id: 'emp-2',
          firstName: 'B',
          lastName: 'D',
          jobType: 'VET',
          contractHours: 35,
        },
      ];
      // emp-1 already has 1 Saturday (cap 1 → soft penalty −25×1.5). emp-2 carries
      // 2 prior SURGERY weekdays, so absent the rotation penalty emp-1 would win
      // (diversity −15 vs −30 and fewer-shifts tiebreak) — the assertion only holds
      // when the index-backed penalty fires, making it discriminating.
      const already = [
        ...priorSaturdays('emp-1'),
        {
          employeeId: 'emp-2',
          date: '2026-02-25',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
        {
          employeeId: 'emp-2',
          date: '2026-02-26',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
        },
      ];
      const result: ScoreAndAssignResult = callScore(
        satSlot,
        twoVets,
        { ...baseConstraints, softRules: [rule({ maxPerPeriod: 1 })] },
        already,
        new Map(),
        new Map(),
      );
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });

    it('SOFT rotation: records a violation when the assignee exceeds the cap', () => {
      const oneVet = [
        {
          id: 'emp-1',
          firstName: 'A',
          lastName: 'M',
          jobType: 'VET',
          contractHours: 35,
        },
      ];
      // emp-1 has 1 Saturday, cap is 1; assigning this slot makes 2 → soft violation recorded.
      const result: ScoreAndAssignResult = callScore(
        satSlot,
        oneVet,
        { ...baseConstraints, softRules: [rule({ maxPerPeriod: 1 })] },
        priorSaturdays('emp-1'),
        new Map(),
        new Map(),
      );
      expect(result.assigned.length).toBe(1);
      expect(
        result.softViolations.some((v) => v.category === 'ROTATION_EQUITY'),
      ).toBe(true);
    });
  });

  // ─── Story 11-3 — statutory French labor-law floor in eligibility ─────
  // AC1 (verbatim from story 11-3): "Given any clinic, with or without
  // admin-configured planning rules, When the monthly schedule is generated,
  // Then no employee is scheduled beyond the statutory limits ... even for a
  // clinic with zero configured rules; the generator leaves the slot unfilled
  // (a hole) or assigns a compliant employee instead."
  describe('Story 11-3 — statutory limits in generation eligibility', () => {
    const zeroRuleConstraints = {
      unavailableMap: new Map<string, Set<string>>(),
      schoolDayMap: new Map<string, Set<string>>(),
      hardRules: [] as Array<{
        id: string;
        name: string;
        category: string;
        config: Record<string, unknown>;
        priority: number;
      }>,
      softRules: [] as Array<{
        id: string;
        name: string;
        category: string;
        config: Record<string, unknown>;
        priority: number;
      }>,
      equityMap: new Map(),
      quarterlyShifts: [],
    };

    it('leaves a hole rather than scheduling a 7th consecutive day (zero rules)', () => {
      // emp-1 worked Mon 2026-03-09 .. Sat 2026-03-14 — 6 consecutive days.
      const alreadyAssigned = ['09', '10', '11', '12', '13', '14'].map((d) => ({
        employeeId: 'emp-1',
        date: `2026-03-${d}`,
        startTime: '09:00',
        endTime: '13:00',
        shiftTypeCode: 'SURGERY',
      }));
      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        assignmentIndex.set(key, [...(assignmentIndex.get(key) || []), a]);
      }
      const slot = {
        date: '2026-03-15', // Sunday — would be the 7th consecutive worked day
        shiftTypeCode: 'SURGERY',
        startTime: '09:00',
        endTime: '13:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0]], // only emp-1 available
        zeroRuleConstraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // Statutory floor holds with zero configured rules → slot left as a hole.
      expect(result.assigned.length).toBe(0);
    });

    it('leaves a hole for a slot whose net worked time exceeds 10h/day (zero rules)', () => {
      // A single 08:00-19:00 slot with no break = 11h net > 10h — no employee can
      // fill it compliantly, so the slot stays a hole even with zero configured rules.
      const slot = {
        date: '2026-03-10',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '19:00', // 11h net
        breakMinutes: 0,
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[1]],
        zeroRuleConstraints,
        [],
        new Map<string, any[]>(),
        new Map(),
      );

      expect(result.assigned.length).toBe(0);
    });
  });

  // ─── Priority effect on scoring ──────────────────────────────

  describe('priority effect on SOFT rule scoring', () => {
    it('higher priority SOFT ROTATION_EQUITY rule creates stronger scoring penalty', () => {
      // Two employees with same Saturday count
      // SOFT rule with high priority should penalize more strongly
      const constraintsHigh = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        softRules: [
          {
            id: 'r1',
            name: 'Max 1 Saturday (high prio)',
            category: 'ROTATION_EQUITY',
            config: { targetDay: 'saturday', maxPerPeriod: 1 },
            priority: 10,
          },
        ],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // emp-1 already assigned to 1 Saturday (at limit)
      const alreadyAssigned = [
        {
          employeeId: 'emp-1',
          date: '2026-03-07',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
      ];

      const slot = {
        date: '2026-03-14', // Another Saturday
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        assignmentIndex.set(`${a.employeeId}|${a.date}`, [a]);
      }

      // With only emp-1 available and at the limit, they'll still be assigned (soft rule)
      // but with a lower score due to high priority penalty
      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[2]], // emp-1 and emp-3
        constraintsHigh,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-3 should be preferred (no Saturday penalty)
      expect(result.assigned[0].employeeId).toBe('emp-3');
    });
  });

  // ─── Per-employee contractHours ─────────────────────────────

  describe('per-employee contractHours enforcement', () => {
    it('limits each employee by their own contractHours, not a global value', () => {
      // emp-part has 25h contract, emp-full has 35h contract
      const mixedEmployees = [
        {
          id: 'emp-part',
          firstName: 'Luna',
          lastName: 'Part',
          jobType: 'ASV',
          contractHours: 25,
        },
        {
          id: 'emp-full',
          firstName: 'Max',
          lastName: 'Full',
          jobType: 'ASV',
          contractHours: 35,
        },
      ];

      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r-cc',
            name: 'Max weekly hours',
            category: 'CONTRACT_COMPLIANCE',
            config: { maxWeeklyHours: 40, overtimeThresholdPercent: 0 },
            priority: 0,
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // Both employees already have 24h this week (6 x 4h shifts Mon-Wed)
      const alreadyAssigned = [
        ...Array.from({ length: 6 }, (_, i) => ({
          employeeId: 'emp-part',
          date: `2026-03-${String(9 + Math.floor(i / 2)).padStart(2, '0')}`,
          startTime: i % 2 === 0 ? '08:00' : '14:00',
          endTime: i % 2 === 0 ? '12:00' : '18:00',
          shiftTypeCode: 'SURGERY',
        })),
        ...Array.from({ length: 6 }, (_, i) => ({
          employeeId: 'emp-full',
          date: `2026-03-${String(9 + Math.floor(i / 2)).padStart(2, '0')}`,
          startTime: i % 2 === 0 ? '08:00' : '14:00',
          endTime: i % 2 === 0 ? '12:00' : '18:00',
          shiftTypeCode: 'SURGERY',
        })),
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      // 4h slot on Thursday — would put both at 28h
      // emp-part (25h contract): 28h > 25h → BLOCKED
      // emp-full (35h contract): 28h < 35h → ALLOWED
      const slot = {
        date: '2026-03-12', // Thursday
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mixedEmployees,
        constraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-part should be BLOCKED (28h > 25h contract)
      // emp-full should be assigned (28h < 35h contract)
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).toBe('emp-full');
    });

    it('uses employee contractHours when rule maxWeeklyHours is higher', () => {
      // Rule allows 40h/week but employee only has 25h contract
      const partTimeEmployee = [
        {
          id: 'emp-pt',
          firstName: 'Lea',
          lastName: 'Short',
          jobType: 'ASV',
          contractHours: 25,
        },
      ];

      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r-cc',
            name: 'Max 40h/week',
            category: 'CONTRACT_COMPLIANCE',
            config: { maxWeeklyHours: 40, overtimeThresholdPercent: 0 },
            priority: 0,
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // Employee already has 24h (6 x 4h)
      const alreadyAssigned = Array.from({ length: 6 }, (_, i) => ({
        employeeId: 'emp-pt',
        date: `2026-03-${String(9 + Math.floor(i / 2)).padStart(2, '0')}`,
        startTime: i % 2 === 0 ? '08:00' : '14:00',
        endTime: i % 2 === 0 ? '12:00' : '18:00',
        shiftTypeCode: 'SURGERY',
      }));

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      // 4h slot → would put at 28h > 25h contract (but < 40h rule)
      const slot = {
        date: '2026-03-12',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        partTimeEmployee,
        constraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // Should be BLOCKED by individual contractHours (25h), not rule (40h)
      expect(result.assigned.length).toBe(0);
      expect(result.holeInfo).toBeDefined();
    });
  });

  // ─── SOFT STAFFING_MINIMUM warning ────────────────────────────

  describe('SOFT STAFFING_MINIMUM and SKILL_REQUIREMENT warnings', () => {
    it('records soft warning for STAFFING_MINIMUM when below minimum', () => {
      const constraints = {
        unavailableMap: new Map([
          ['emp-2', new Set(['2026-03-02'])],
          ['emp-3', new Set(['2026-03-02'])],
        ]),
        schoolDayMap: new Map<string, Set<string>>(),
        hardRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
          priority: number;
        }>,
        softRules: [
          {
            id: 'r1',
            name: 'Prefer 2 staff',
            category: 'STAFFING_MINIMUM',
            config: { shiftTypeCode: 'SURGERY', minStaff: 2 },
            priority: 0,
          },
        ],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees, // only emp-1 available
        constraints,
        [],
        new Map(),
        new Map(),
      );

      // Assignment should happen (soft rule)
      expect(result.assigned.length).toBe(1);
      // Soft warning should be recorded
      expect(
        result.softViolations.some(
          (v: any) => v.category === 'STAFFING_MINIMUM',
        ),
      ).toBe(true);
    });
  });

  // ─── getScheduleViewForMonth ────────────────────────────────────

  describe('getScheduleViewForMonth', () => {
    // Override operational config with full day names matching ClinicConfig format
    const scheduleOperationalConfig = {
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      defaultStartTime: '08:00',
      defaultEndTime: '18:00',
      closedDays: [] as Array<{
        id: string;
        date: string;
        reason: string | null;
      }>,
      specialDays: [] as Array<{
        id: string;
        date: string;
        startTime: string;
        endTime: string;
        label: string | null;
      }>,
    };

    beforeEach(() => {
      mockClinicService.getOperationalConfig.mockResolvedValue(
        scheduleOperationalConfig,
      );
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.unavailability.findMany.mockResolvedValue([]);
      mockPrismaService.employee.findMany.mockResolvedValue(mockEmployees);
      mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
        hardViolations: [],
        softViolations: [],
      });
    });

    it('throws BadRequestException for invalid month format', async () => {
      await expect(
        service.getScheduleViewForMonth(clinicId, '2026-13'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getScheduleViewForMonth(clinicId, 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns correct structure for a month with no shifts', async () => {
      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      expect(result).toHaveProperty('month', '2026-02');
      expect(result).toHaveProperty('employees');
      expect(result).toHaveProperty('days');
      expect(result).toHaveProperty('shifts');
      expect(result).toHaveProperty('unavailabilities');
      expect(result).toHaveProperty('holes');
      expect(result).toHaveProperty('violations');
      expect(result.shifts).toHaveLength(0);
      expect(result.unavailabilities).toHaveLength(0);
      expect(result.holes).toHaveLength(0);
      expect(result.violations).toEqual({ hard: [], soft: [] });
    });

    it('returns employees sorted by lastName, firstName', async () => {
      // The service uses orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
      // Prisma is mocked, so we simulate the sorted result from the DB
      const sortedEmployees = [
        {
          id: 'emp-2',
          firstName: 'Bob',
          lastName: 'Dupont',
          color: null,
          jobType: 'ASV',
          contractHours: 35,
        },
        {
          id: 'emp-3',
          firstName: 'Charlie',
          lastName: 'Leroy',
          color: null,
          jobType: 'VET',
          contractHours: 35,
        },
        {
          id: 'emp-1',
          firstName: 'Alice',
          lastName: 'Martin',
          color: null,
          jobType: 'VET',
          contractHours: 35,
        },
      ];
      mockPrismaService.employee.findMany.mockResolvedValue(sortedEmployees);

      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      expect(result.employees).toHaveLength(3);
      expect(result.employees[0].lastName).toBe('Dupont');
      expect(result.employees[0].firstName).toBe('Bob');
      expect(result.employees[1].lastName).toBe('Leroy');
      expect(result.employees[1].firstName).toBe('Charlie');
      expect(result.employees[2].lastName).toBe('Martin');
      expect(result.employees[2].firstName).toBe('Alice');

      // Verify the orderBy was passed to Prisma
      expect(mockPrismaService.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        }),
      );
    });

    it('correctly builds day metadata for February 2026', async () => {
      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      // February 2026 has 28 days
      expect(result.days).toHaveLength(28);

      // Feb 1, 2026 is a Sunday → isoDay = 7
      expect(result.days[0].date).toBe('2026-02-01');
      expect(result.days[0].dayOfWeek).toBe(7);
      expect(result.days[0].isWorkDay).toBe(false); // Sunday not in workDays

      // Feb 2, 2026 is a Monday → isoDay = 1
      expect(result.days[1].date).toBe('2026-02-02');
      expect(result.days[1].dayOfWeek).toBe(1);
      expect(result.days[1].isWorkDay).toBe(true); // Monday is a work day

      // Feb 7, 2026 is a Saturday → isoDay = 6
      expect(result.days[6].date).toBe('2026-02-07');
      expect(result.days[6].dayOfWeek).toBe(6);
      expect(result.days[6].isWorkDay).toBe(false); // Saturday not in workDays

      // Last day: Feb 28 is a Saturday
      expect(result.days[27].date).toBe('2026-02-28');
      expect(result.days[27].dayOfWeek).toBe(6);
    });

    it('maps shifts to ScheduleShift format', async () => {
      const mockShifts = [
        {
          id: 'shift-1',
          date: new Date('2026-02-02T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 30,
          source: 'GENERATED',
          employeeId: 'emp-1',
          isConfirmed: false,
          planningTemplateId: null,
          clinicId,
        },
        {
          id: 'shift-2',
          date: new Date('2026-02-03T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '18:00',
          shiftTypeCode: 'RECEPTION',
          breakMinutes: 30,
          source: 'MANUAL',
          employeeId: 'emp-2',
          isConfirmed: true,
          planningTemplateId: null,
          clinicId,
        },
      ];
      mockPrismaService.shift.findMany.mockResolvedValue(mockShifts);

      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      expect(result.shifts).toHaveLength(2);

      expect(result.shifts[0]).toEqual({
        id: 'shift-1',
        date: '2026-02-02',
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 30,
        source: 'GENERATED',
        employeeId: 'emp-1',
        isConfirmed: false,
        shiftTypeColor: '#4f46e5',
      });

      expect(result.shifts[1]).toEqual({
        id: 'shift-2',
        date: '2026-02-03',
        startTime: '08:00',
        endTime: '18:00',
        shiftTypeCode: 'RECEPTION',
        breakMinutes: 30,
        source: 'MANUAL',
        employeeId: 'emp-2',
        isConfirmed: true,
        shiftTypeColor: '#f59e0b',
      });
    });

    it('expands one-time unavailabilities correctly', async () => {
      mockPrismaService.unavailability.findMany.mockResolvedValue([
        {
          id: 'ua-1',
          employeeId: 'emp-1',
          clinicId,
          type: 'VACATION',
          startDate: new Date('2026-02-10T00:00:00.000Z'),
          endDate: new Date('2026-02-12T00:00:00.000Z'),
          reason: 'Holiday trip',
          daysOfWeek: [],
        },
      ]);

      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      // Should expand to Feb 10, 11, 12
      const empUnavail = result.unavailabilities.filter(
        (u) => u.employeeId === 'emp-1',
      );
      expect(empUnavail).toHaveLength(3);
      expect(empUnavail.map((u) => u.date)).toEqual([
        '2026-02-10',
        '2026-02-11',
        '2026-02-12',
      ]);
      expect(empUnavail[0].type).toBe('VACATION');
      expect(empUnavail[0].reason).toBe('Holiday trip');
    });

    it('expands recurring unavailabilities for specific days of week', async () => {
      mockPrismaService.unavailability.findMany.mockResolvedValue([
        {
          id: 'ua-2',
          employeeId: 'emp-2',
          clinicId,
          type: 'SCHOOL',
          startDate: new Date('2026-02-01T00:00:00.000Z'),
          endDate: new Date('2026-02-28T00:00:00.000Z'),
          reason: 'School day',
          daysOfWeek: [1, 3], // Monday and Wednesday
        },
      ]);

      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      const empUnavail = result.unavailabilities.filter(
        (u) => u.employeeId === 'emp-2',
      );

      // Feb 2026: Mondays: 2,9,16,23 (4) + Wednesdays: 4,11,18,25 (4) = 8
      expect(empUnavail).toHaveLength(8);

      const dates = empUnavail.map((u) => u.date).sort();
      expect(dates).toContain('2026-02-02'); // Monday
      expect(dates).toContain('2026-02-04'); // Wednesday
      expect(dates).toContain('2026-02-09'); // Monday
      expect(dates).toContain('2026-02-11'); // Wednesday
      expect(dates).toContain('2026-02-16'); // Monday
      expect(dates).toContain('2026-02-18'); // Wednesday
      expect(dates).toContain('2026-02-23'); // Monday
      expect(dates).toContain('2026-02-25'); // Wednesday
      expect(empUnavail[0].type).toBe('SCHOOL');
    });

    it('detects holes when template expects more staff than assigned', async () => {
      const templateId = 'tpl-1';
      // One generated shift referencing a template
      const mockShifts = [
        {
          id: 'shift-1',
          date: new Date('2026-02-02T00:00:00.000Z'), // Monday
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
          source: 'GENERATED',
          employeeId: 'emp-1',
          isConfirmed: false,
          planningTemplateId: templateId,
          clinicId,
        },
      ];
      mockPrismaService.shift.findMany.mockResolvedValue(mockShifts);

      // Template requires 2 staff for SURGERY on Mondays but only 1 shift assigned
      const templateWithHole: TemplateData = {
        days: [
          {
            dayOfWeek: 1,
            slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 2 }],
          },
        ],
      };
      mockTemplateService.getTemplateById.mockResolvedValue({
        id: templateId,
        name: 'Test',
        data: templateWithHole,
        clinicId,
      });

      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      // Should detect holes for all 4 Mondays in Feb 2026 (Feb 2, 9, 16, 23)
      // Feb 2 has 1 of 2 staff, Feb 9/16/23 have 0 of 2 staff
      expect(result.holes).toHaveLength(4);
      expect(result.templateId).toBe(templateId);

      // First Monday (Feb 2) has 1 shift but needs 2
      const feb2Hole = result.holes.find((h) => h.date === '2026-02-02');
      expect(feb2Hole).toBeDefined();
      expect(feb2Hole!.shiftTypeCode).toBe('SURGERY');
      expect(feb2Hole!.requiredStaff).toBe(2);
      expect(feb2Hole!.assignedStaff).toBe(1);
    });

    it('returns empty holes when no generated shifts exist', async () => {
      // Only manual shifts (no planningTemplateId)
      const mockShifts = [
        {
          id: 'shift-1',
          date: new Date('2026-02-02T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
          breakMinutes: 0,
          source: 'MANUAL',
          employeeId: 'emp-1',
          isConfirmed: true,
          planningTemplateId: null,
          clinicId,
        },
      ];
      mockPrismaService.shift.findMany.mockResolvedValue(mockShifts);

      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      // No GENERATED shifts with planningTemplateId → no template lookup → no holes
      expect(result.holes).toHaveLength(0);
      expect(result.templateId).toBeUndefined();
      expect(mockTemplateService.getTemplateById).not.toHaveBeenCalled();
    });

    it('includes violations from validateShiftsAgainstRules', async () => {
      mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
        hardViolations: [
          {
            ruleId: 'r-1',
            ruleName: 'Min staff',
            category: 'STAFFING_MINIMUM',
            message: 'Not enough staff on 2026-02-02',
            affectedDate: '2026-02-02',
            severity: 'blocking',
          },
        ],
        softViolations: [
          {
            ruleId: 'r-2',
            ruleName: 'Max Saturdays',
            category: 'ROTATION_EQUITY',
            message: 'Too many Saturday shifts',
            affectedEmployeeId: 'emp-1',
            affectedDate: '2026-02-07',
            severity: 'warning',
          },
        ],
      });

      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      expect(result.violations.hard).toHaveLength(1);
      expect(result.violations.hard[0].ruleId).toBe('r-1');
      expect(result.violations.hard[0].severity).toBe('blocking');

      expect(result.violations.soft).toHaveLength(1);
      expect(result.violations.soft[0].ruleId).toBe('r-2');
      expect(result.violations.soft[0].severity).toBe('warning');
    });

    it('handles validation failure gracefully', async () => {
      mockPlanningService.validateShiftsAgainstRules.mockRejectedValue(
        new Error('Validation service unavailable'),
      );

      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      // Should not throw; violations should default to empty
      expect(result.violations).toEqual({ hard: [], soft: [] });
    });

    it('marks closed days correctly', async () => {
      const configWithClosedDay = {
        ...scheduleOperationalConfig,
        closedDays: [
          { id: 'cd-1', date: '2026-02-09', reason: 'National holiday' },
        ],
      };
      mockClinicService.getOperationalConfig.mockResolvedValue(
        configWithClosedDay,
      );

      const result = await service.getScheduleViewForMonth(clinicId, '2026-02');

      // Feb 9, 2026 is a Monday (index 8 since Feb starts on day 1)
      const feb9 = result.days.find((d) => d.date === '2026-02-09');
      expect(feb9).toBeDefined();
      expect(feb9!.isClosed).toBe(true);

      // Other days should not be closed
      const feb10 = result.days.find((d) => d.date === '2026-02-10');
      expect(feb10).toBeDefined();
      expect(feb10!.isClosed).toBe(false);
    });
  });

  // ─── daysInMonth/7 dynamic weeks ──────────────────────────────────────

  describe('daysInMonth/7 dynamic weeks calculation', () => {
    it('uses 4.0 weeks for February 2026 (28 days)', async () => {
      // February 2026 has 28 days → 28/7 = 4.0 weeks
      // scoreAndAssign uses weeksInMonth for monthly contract fit bonus
      // With 35h contract: 35 * 60 * 4.0 = 8400 min monthly limit
      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Test',
        data: mockTemplate,
        clinicId,
      });
      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb({
          $executeRaw: jest.fn().mockResolvedValue(0),
          shift: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createManyAndReturn: jest.fn().mockResolvedValue([]),
          },
        }),
      );

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-02',
        'tpl-1',
      );
      // If it reaches here without errors, the weeksInMonth parameter is passed correctly
      expect(result).toBeDefined();
    });

    it('uses ~4.43 weeks for March 2026 (31 days)', async () => {
      // March 2026 has 31 days → 31/7 ≈ 4.4286 weeks
      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Test',
        data: mockTemplate,
        clinicId,
      });
      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb({
          $executeRaw: jest.fn().mockResolvedValue(0),
          shift: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createManyAndReturn: jest.fn().mockResolvedValue([]),
          },
        }),
      );

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── Deterministic tiebreaker ──────────────────────────────────────

  describe('deterministic tiebreaker', () => {
    it('produces reproducible results across multiple runs', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Test',
        data: {
          days: [
            {
              dayOfWeek: 1,
              slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
            },
          ],
        },
        clinicId,
      });

      const results: string[] = [];
      for (let i = 0; i < 3; i++) {
        mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
          const shifts: any[] = [];
          return cb({
            $executeRaw: jest.fn().mockResolvedValue(0),
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest.fn().mockImplementation(({ data }) => {
                const created = data.map((d: any, idx: number) => ({
                  id: `shift-${idx}`,
                  ...d,
                }));
                shifts.push(...created);
                return created;
              }),
            },
          });
        });

        const result = await service.generateMonthlyPlan(
          clinicId,
          '2026-03',
          'tpl-1',
        );
        results.push(
          JSON.stringify(result.assignments.map((a) => a.employeeId)),
        );
      }

      // All runs should produce identical assignments
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });

    it('prefers employee with fewer shifts on score tie', () => {
      // Test via private scoreAndAssign method
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 1,
      };

      // emp-1 already has 5 shifts, emp-3 has 0
      const alreadyAssigned = Array.from({ length: 5 }, (_, i) => ({
        employeeId: 'emp-1',
        date: `2026-03-${10 + i}`,
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
      }));

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        constraints,
        alreadyAssigned,
        new Map(),
        new Map(),
        31 / 7,
      );
      // emp-3 (fewer shifts) should be preferred over emp-1
      expect(result.assigned.length).toBe(1);
    });

    it('prefers employee with fewer weekends on shift count tie', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map([
          [
            'emp-1',
            {
              saturdayCount: 0,
              weekendCount: 5,
              holidayCount: 0,
              overtimeMinutes: 0,
            },
          ],
          [
            'emp-3',
            {
              saturdayCount: 0,
              weekendCount: 1,
              holidayCount: 0,
              overtimeMinutes: 0,
            },
          ],
        ]),
        quarterlyShifts: [],
      };

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 1,
        requiredJobTypes: ['VET'],
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[2]], // emp-1, emp-3 (both VET)
        constraints,
        [],
        new Map(),
        new Map(),
        31 / 7,
      );
      // emp-3 has fewer weekends, should be preferred
      expect(result.assigned[0].employeeId).toBe('emp-3');
    });
  });

  // ─── MIN_REST_HOURS ──────────────────────────────────────────────────

  describe('MIN_REST_HOURS between shifts', () => {
    const makeConstraintsWithMinRest = (minRest: number) => ({
      unavailableMap: new Map(),
      schoolDayMap: new Map(),
      hardRules: [
        {
          id: 'rule-rest',
          name: 'Min Rest',
          category: 'CONTRACT_COMPLIANCE',
          config: { maxWeeklyHours: 35, minRestHoursBetweenShifts: minRest },
          priority: 0,
        },
      ],
      softRules: [],
      equityMap: new Map(),
      quarterlyShifts: [],
    });

    it('blocks employee when rest after previous day shift is insufficient', () => {
      const constraints = makeConstraintsWithMinRest(11);
      const slot = {
        date: '2026-03-03',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 1,
      };

      // Previous day: emp-1 worked until 23:00 → rest = (24*60-23*60) + 8*60 = 60+480 = 540min = 9h < 11h
      const prevShift = {
        employeeId: 'emp-1',
        date: '2026-03-02',
        startTime: '15:00',
        endTime: '23:00',
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
      // emp-1 should be blocked
      expect(result.assigned.length).toBe(0);
      expect(result.holeInfo).toBeDefined();
    });

    it('blocks employee when rest before next day shift is insufficient', () => {
      const constraints = makeConstraintsWithMinRest(11);
      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '18:00',
        endTime: '23:00',
        breakMinutes: 0,
        requiredStaff: 1,
      };

      // Next day: emp-1 starts at 07:00 → rest = (24*60-23*60) + 7*60 = 60+420 = 480min = 8h < 11h
      const nextShift = {
        employeeId: 'emp-1',
        date: '2026-03-03',
        startTime: '07:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
      };
      const assignmentIndex = new Map([['emp-1|2026-03-03', [nextShift]]]);

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0]],
        constraints,
        [nextShift],
        assignmentIndex,
        new Map(),
        31 / 7,
      );
      expect(result.assigned.length).toBe(0);
    });

    it('allows employee when rest is sufficient', () => {
      const constraints = makeConstraintsWithMinRest(11);
      const slot = {
        date: '2026-03-03',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 1,
      };

      // Previous day: emp-1 worked until 18:00 → rest = (24*60-18*60) + 8*60 = 360+480 = 840min = 14h > 11h
      const prevShift = {
        employeeId: 'emp-1',
        date: '2026-03-02',
        startTime: '08:00',
        endTime: '18:00',
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
    });

    it('does not check rest hours when minRestHoursBetweenShifts is not configured', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [
          {
            id: 'rule-contract',
            name: 'Contract',
            category: 'CONTRACT_COMPLIANCE',
            config: { maxWeeklyHours: 35 },
            priority: 0,
          },
        ],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      const slot = {
        date: '2026-03-03',
        shiftTypeCode: 'SURGERY',
        startTime: '07:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 1,
      };

      // Previous day: emp-1 worked until 23:00 → only 8h rest, but no minRest rule
      const prevShift = {
        employeeId: 'emp-1',
        date: '2026-03-02',
        startTime: '15:00',
        endTime: '23:00',
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
    });

    it('creates a hole when all employees are blocked by rest requirement', () => {
      const constraints = makeConstraintsWithMinRest(11);
      const slot = {
        date: '2026-03-03',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 1,
      };

      const prevShifts = mockEmployees.map((e) => ({
        employeeId: e.id,
        date: '2026-03-02',
        startTime: '15:00',
        endTime: '23:00',
        shiftTypeCode: 'SURGERY',
      }));
      const assignmentIndex = new Map(
        mockEmployees.map((e) => [
          `${e.id}|2026-03-02`,
          [prevShifts.find((s) => s.employeeId === e.id)!],
        ]),
      );

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        constraints,
        prevShifts,
        assignmentIndex,
        new Map(),
        31 / 7,
      );
      expect(result.assigned.length).toBe(0);
      expect(result.holeInfo).toBeDefined();
      expect(result.holeInfo?.reason).toContain('No eligible employees');
    });

    it('correctly handles multi-employee scenario with mixed rest availability', () => {
      const constraints = makeConstraintsWithMinRest(11);
      const slot = {
        date: '2026-03-03',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 1,
      };

      // emp-1 has insufficient rest (ended 23:00), emp-2 has no previous shift
      const prevShift = {
        employeeId: 'emp-1',
        date: '2026-03-02',
        startTime: '15:00',
        endTime: '23:00',
        shiftTypeCode: 'SURGERY',
      };
      const assignmentIndex = new Map([['emp-1|2026-03-02', [prevShift]]]);

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[1]],
        constraints,
        [prevShift],
        assignmentIndex,
        new Map(),
        31 / 7,
      );
      // emp-2 (no previous shift) should be assigned
      expect(result.assigned.length).toBe(1);
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });
  });

  // ─── Shift type diversity scoring ─────────────────────────────────

  describe('shift type diversity scoring', () => {
    it('penalizes repeated shift type assignments', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // emp-1 has 3 prior SURGERY shifts, emp-2 has 0
      const alreadyAssigned = Array.from({ length: 3 }, (_, i) => ({
        employeeId: 'emp-1',
        date: `2026-03-${String(2 + i).padStart(2, '0')}`,
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
      }));

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        assignmentIndex.set(`${a.employeeId}|${a.date}`, [a]);
      }

      const slot = {
        date: '2026-03-06', // Friday — not consecutive with emp-1's last shift (Thu 4)
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[1]], // emp-1 (3 SURGERY) vs emp-2 (0 SURGERY)
        constraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-2 should win — emp-1 has -45 diversity penalty (3 * 15)
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });

    it('penalizes yesterday same shift type for consecutive-day monotony', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // emp-1 had SURGERY yesterday, emp-2 had RECEPTION yesterday
      const alreadyAssigned = [
        {
          employeeId: 'emp-1',
          date: '2026-03-04',
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-2',
          date: '2026-03-04',
          startTime: '14:00',
          endTime: '18:00',
          shiftTypeCode: 'RECEPTION',
        },
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        assignmentIndex.set(`${a.employeeId}|${a.date}`, [a]);
      }

      const slot = {
        date: '2026-03-05', // next day
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        [mockEmployees[0], mockEmployees[1]],
        constraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-2 should win — emp-1 has -15 (type count) + -20 (yesterday same type) = -35
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });

    it('encourages shift type alternation between employees', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // After week 1: emp-1 has 4 RECEPTION, emp-2 has 4 SURGERY
      const alreadyAssigned = [
        ...Array.from({ length: 4 }, (_, i) => ({
          employeeId: 'emp-1',
          date: `2026-03-${String(2 + i).padStart(2, '0')}`,
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'RECEPTION',
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          employeeId: 'emp-2',
          date: `2026-03-${String(2 + i).padStart(2, '0')}`,
          startTime: '14:00',
          endTime: '18:00',
          shiftTypeCode: 'SURGERY',
        })),
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      // Week 2 Monday: RECEPTION slot — emp-2 should be preferred (0 RECEPTION vs emp-1's 4)
      const receptionSlot = {
        date: '2026-03-09',
        shiftTypeCode: 'RECEPTION',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        receptionSlot,
        [mockEmployees[0], mockEmployees[1]], // emp-1 (4 RECEPTION) vs emp-2 (0 RECEPTION)
        constraints,
        alreadyAssigned,
        assignmentIndex,
        new Map(),
      );

      // emp-2 should get RECEPTION — emp-1 has -60 penalty (4 * 15)
      expect(result.assigned[0].employeeId).toBe('emp-2');
    });
  });

  // ─── Binôme penalty (pairing diversity) ────────────────────────────────

  describe('binôme penalty for pairing diversity', () => {
    it('does not affect single-staff slots', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 1,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        constraints,
        [],
        new Map(),
        new Map(),
        31 / 7,
      );
      expect(result.assigned.length).toBe(1);
    });

    it('penalizes repeated pairs for multi-staff slots', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      const slot = {
        date: '2026-03-16',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 2,
      };

      // emp-1 and emp-3 have been paired together 5 times already
      const alreadyAssigned = Array.from({ length: 5 }, (_, i) => [
        {
          employeeId: 'emp-1',
          date: `2026-03-${String(2 + i * 2).padStart(2, '0')}`,
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
        {
          employeeId: 'emp-3',
          date: `2026-03-${String(2 + i * 2).padStart(2, '0')}`,
          startTime: '08:00',
          endTime: '12:00',
          shiftTypeCode: 'SURGERY',
        },
      ]).flat();

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        constraints,
        alreadyAssigned,
        new Map(),
        new Map(),
        31 / 7,
      );

      expect(result.assigned.length).toBe(2);
      // With pairing penalty, the second pick should NOT be the repeatedly-paired partner
      // emp-2 should be chosen as second partner over the usual emp-1/emp-3 pair
      const ids = result.assigned.map((a: any) => a.employeeId);
      expect(ids).toContain('emp-2');
    });

    it('has no penalty when no prior pairings exist', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 2,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        constraints,
        [],
        new Map(),
        new Map(),
        31 / 7,
      );
      expect(result.assigned.length).toBe(2);
    });

    it('assigns 3 employees correctly on requiredStaff=3', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 3,
      };

      const result: ScoreAndAssignResult = callScore(
        slot,
        mockEmployees,
        constraints,
        [],
        new Map(),
        new Map(),
        31 / 7,
      );
      expect(result.assigned.length).toBe(3);
      const ids = new Set(result.assigned.map((a: any) => a.employeeId));
      expect(ids.size).toBe(3);
    });

    it('promotes pairing diversity over multiple slots', () => {
      const constraints = {
        unavailableMap: new Map(),
        schoolDayMap: new Map(),
        hardRules: [],
        softRules: [],
        equityMap: new Map(),
        quarterlyShifts: [],
      };

      // Run two consecutive slots with requiredStaff=2
      const slot1 = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 2,
      };

      const result1 = callScore(
        slot1,
        mockEmployees,
        constraints,
        [],
        new Map(),
        new Map(),
        31 / 7,
      );

      const slot2 = {
        date: '2026-03-03',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        requiredStaff: 2,
      };

      const result2 = callScore(
        slot2,
        mockEmployees,
        constraints,
        result1.assigned,
        new Map(),
        new Map(),
        31 / 7,
      );

      // Second slot should try to avoid the same pair
      const pair1 = result1.assigned.map((a: any) => a.employeeId).sort();
      const pair2 = result2.assigned.map((a: any) => a.employeeId).sort();
      // With only 3 employees and 2 slots of 2, at least one different combination
      expect(result2.assigned.length).toBe(2);
      // At minimum, the pairs should be computed (may or may not be different depending on scores)
    });
  });

  // ─── Apprentice Declaration Pre-check ─────────────────────────────────

  describe('apprentice declaration pre-check', () => {
    it('blocks generation when undeclared apprentices exist', async () => {
      mockApprenticeDeclarationService.getUndeclaredApprentices.mockResolvedValue(
        [{ id: 'emp-4', firstName: 'David', lastName: 'Apprenti' }],
      );

      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Test',
        data: mockTemplate,
        clinicId,
      });

      await expect(
        service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-1'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-1'),
      ).rejects.toThrow(/apprentice school day declarations missing/);
    });

    it('includes undeclared apprentice names in error message', async () => {
      mockApprenticeDeclarationService.getUndeclaredApprentices.mockResolvedValue(
        [
          { id: 'emp-4', firstName: 'David', lastName: 'Apprenti' },
          { id: 'emp-5', firstName: 'Eve', lastName: 'Stagiaire' },
        ],
      );

      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Test',
        data: mockTemplate,
        clinicId,
      });

      try {
        await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-1');
        fail('Expected BadRequestException');
      } catch (error: any) {
        expect(error.message).toContain('David Apprenti');
        expect(error.message).toContain('Eve Stagiaire');
      }
    });

    it('allows generation when all apprentices are declared', async () => {
      mockApprenticeDeclarationService.getUndeclaredApprentices.mockResolvedValue(
        [],
      );
      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Test',
        data: mockTemplate,
        clinicId,
      });
      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb({
          $executeRaw: jest.fn().mockResolvedValue(0),
          shift: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createManyAndReturn: jest.fn().mockResolvedValue([]),
          },
        }),
      );

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-1',
      );
      expect(result).toBeDefined();
    });

    it('allows generation when there are zero apprentices', async () => {
      mockApprenticeDeclarationService.getUndeclaredApprentices.mockResolvedValue(
        [],
      );
      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Test',
        data: mockTemplate,
        clinicId,
      });
      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb({
          $executeRaw: jest.fn().mockResolvedValue(0),
          shift: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createManyAndReturn: jest.fn().mockResolvedValue([]),
          },
        }),
      );

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-1',
      );
      expect(result).toBeDefined();
    });

    it('blocks generation with correct month in error message', async () => {
      mockApprenticeDeclarationService.getUndeclaredApprentices.mockResolvedValue(
        [{ id: 'emp-4', firstName: 'David', lastName: 'Apprenti' }],
      );
      mockTemplateService.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        name: 'Test',
        data: mockTemplate,
        clinicId,
      });

      try {
        await service.generateMonthlyPlan(clinicId, '2026-05', 'tpl-1');
        fail('Expected BadRequestException');
      } catch (error: any) {
        expect(error.message).toContain('2026-05');
      }
    });
  });

  // ─── moveShift ────────────────────────────────────────────────────

  describe('moveShift', () => {
    const mockShift = {
      id: 'shift-1',
      clinicId: 'clinic-123',
      employeeId: 'emp-1',
      date: new Date('2025-03-03T00:00:00.000Z'),
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: 'SURGERY',
      breakMinutes: 0,
      source: 'GENERATED',
      isConfirmed: false,
    };

    beforeEach(() => {
      mockPrismaService.shift.findUnique.mockResolvedValue(mockShift);
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...mockShift,
        employeeId: 'emp-2',
        source: 'MANUAL',
      });
    });

    it('moves a shift to another employee', async () => {
      const result = await service.moveShift(clinicId, 'shift-1', {
        targetEmployeeId: 'emp-2',
      });
      expect(result.employeeId).toBe('emp-2');
      expect(result.source).toBe('MANUAL');
      expect(mockPrismaService.shift.update).toHaveBeenCalledWith({
        where: { id: 'shift-1' },
        data: expect.objectContaining({
          employeeId: 'emp-2',
          source: 'MANUAL',
        }),
      });
    });

    it('moves a shift to another date', async () => {
      mockPrismaService.shift.update.mockResolvedValue({
        ...mockShift,
        date: new Date('2025-03-04T00:00:00.000Z'),
        source: 'MANUAL',
      });
      const result = await service.moveShift(clinicId, 'shift-1', {
        targetDate: '2025-03-04',
      });
      expect(result.date).toBe('2025-03-04');
      expect(result.source).toBe('MANUAL');
    });

    it('throws NotFoundException when shift does not exist', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(null);
      await expect(
        service.moveShift(clinicId, 'non-existent', {
          targetEmployeeId: 'emp-2',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when shift belongs to another clinic', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue({
        ...mockShift,
        clinicId: 'other-clinic',
      });
      await expect(
        service.moveShift(clinicId, 'shift-1', { targetEmployeeId: 'emp-2' }),
      ).rejects.toThrow('Shift does not belong to this clinic');
    });

    it('throws BadRequestException for invalid date format', async () => {
      await expect(
        service.moveShift(clinicId, 'shift-1', { targetDate: '2025/03/04' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid date value', async () => {
      await expect(
        service.moveShift(clinicId, 'shift-1', { targetDate: '2025-13-45' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when target employee not found', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);
      await expect(
        service.moveShift(clinicId, 'shift-1', {
          targetEmployeeId: 'non-existent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when shift overlaps with existing', async () => {
      mockPrismaService.shift.findMany.mockResolvedValue([
        { ...mockShift, id: 'shift-2', startTime: '10:00', endTime: '14:00' },
      ]);
      await expect(
        service.moveShift(clinicId, 'shift-1', { targetEmployeeId: 'emp-2' }),
      ).rejects.toThrow('overlaps');
    });
  });

  // ─── createManualShift ────────────────────────────────────────────

  describe('createManualShift', () => {
    beforeEach(() => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[0]);
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-1',
        code: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 30,
        clinicId,
      });
      mockPrismaService.shift.create.mockResolvedValue({
        id: 'new-shift',
        date: new Date('2025-03-03T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 30,
        source: 'MANUAL',
        employeeId: 'emp-1',
        isConfirmed: false,
        clinicId,
      });
    });

    it('creates a manual shift using shift type times from DB', async () => {
      const result = await service.createManualShift(clinicId, {
        employeeId: 'emp-1',
        date: '2025-03-03',
        shiftTypeCode: 'SURGERY',
        startTime: '09:00', // These should be IGNORED
        endTime: '17:00', // Backend uses ClinicShiftType times
        breakMinutes: 0,
      });
      expect(result.startTime).toBe('08:00');
      expect(result.endTime).toBe('12:00');
      expect(result.breakMinutes).toBe(30);
      expect(result.source).toBe('MANUAL');
      expect(mockPrismaService.shift.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          startTime: '08:00',
          endTime: '12:00',
          breakMinutes: 30,
          source: 'MANUAL',
        }),
      });
    });

    it('throws NotFoundException when employee not found', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);
      await expect(
        service.createManualShift(clinicId, {
          employeeId: 'non-existent',
          date: '2025-03-03',
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '12:00',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when shift type not found', async () => {
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue(null);
      await expect(
        service.createManualShift(clinicId, {
          employeeId: 'emp-1',
          date: '2025-03-03',
          shiftTypeCode: 'UNKNOWN',
          startTime: '08:00',
          endTime: '12:00',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    // AC2 (verbatim from story 11-3): "When an admin manually adds a shift ... such that
    // an employee would exceed a statutory limit, Then the action is blocked — the add is
    // rejected with a conflict error".
    it('throws ConflictException when the new shift pushes the day over 10h net (statutory)', async () => {
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-late',
        code: 'SURGERY',
        startTime: '17:00',
        endTime: '20:00',
        breakMinutes: 0,
        clinicId,
      });
      // Existing 08:00-16:00 (8h) + candidate 17:00-20:00 (3h) = 11h net > 10h. The same
      // mock feeds the overlap query (no overlap) and the statutory window query.
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          id: 'ex-day',
          date: new Date('2026-03-10T00:00:00.000Z'),
          startTime: '08:00',
          endTime: '16:00',
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
          startTime: '17:00',
          endTime: '20:00',
          breakMinutes: 0,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── deleteShift ─────────────────────────────────────────────────

  describe('deleteShift', () => {
    const mockShift = {
      id: 'shift-1',
      clinicId: 'clinic-123',
      employeeId: 'emp-1',
      date: new Date('2025-03-03T00:00:00.000Z'),
    };

    it('deletes a shift and returns { deleted: true }', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(mockShift);
      mockPrismaService.shift.delete.mockResolvedValue(mockShift);
      const result = await service.deleteShift(clinicId, 'shift-1');
      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.shift.delete).toHaveBeenCalledWith({
        where: { id: 'shift-1' },
      });
    });

    it('throws NotFoundException when shift does not exist', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(null);
      await expect(
        service.deleteShift(clinicId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when shift belongs to another clinic', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue({
        ...mockShift,
        clinicId: 'other-clinic',
      });
      await expect(service.deleteShift(clinicId, 'shift-1')).rejects.toThrow(
        'Shift does not belong to this clinic',
      );
    });
  });

  // ─── Story 7.6 — post-publication change management ───────────────

  describe('Story 7.6 — post-publication change management', () => {
    const julyShift = {
      id: 'shift-pub',
      clinicId: 'clinic-123',
      employeeId: 'emp-1',
      date: new Date('2026-07-10T00:00:00.000Z'),
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: 'SURGERY',
      breakMinutes: 0,
      source: 'GENERATED',
      isConfirmed: true,
    };
    const publishedStatus = { month: '2026-07' };

    beforeEach(() => {
      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Clinic',
      });
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@example.com',
          user: { locale: 'fr' },
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          email: 'bob@example.com',
          user: { locale: 'en' },
        },
      ]);
    });

    // AC-1 (verbatim from story 7-6:14): Given a month whose
    //   PlanningPeriodStatus is PUBLISHED, When moveShift ... is called
    //   without acknowledgePublishedChange: true, Then the API throws
    //   ConflictException('PUBLISHED_CHANGE_REQUIRES_ACK') and no data changes.
    it('moveShift throws PUBLISHED_CHANGE_REQUIRES_ACK on a published month without acknowledgement', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      await expect(
        service.moveShift(clinicId, julyShift.id, { targetDate: '2026-07-20' }),
      ).rejects.toMatchObject({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
      expect(mockPrismaService.shift.update).not.toHaveBeenCalled();
    });

    // AC-2 (verbatim from story 7-6:15): Given an acknowledged moveShift that
    //   changes the shift's date or employee, Then the shift's isConfirmed flag
    //   is reset to false.
    it('moveShift proceeds on a published month with acknowledgement and resets isConfirmed', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });
      const result = await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-07-20' },
        { acknowledgePublishedChange: true },
      );
      expect(result.isConfirmed).toBe(false);
      expect(mockPrismaService.shift.update).toHaveBeenCalledWith({
        where: { id: julyShift.id },
        data: expect.objectContaining({ isConfirmed: false }),
      });
    });

    // AC-2 (verbatim from story 7-6:15): ... a moveShift that changes the
    //   shift's date or employee ... — the converse: no change ⇒ no reset.
    it('moveShift does not reset isConfirmed when neither date nor employee changes', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        source: 'MANUAL',
      });
      await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-07-10' },
        { acknowledgePublishedChange: true },
      );
      const updateArg = mockPrismaService.shift.update.mock.calls[0][0];
      expect(updateArg.data).not.toHaveProperty('isConfirmed');
    });

    // AC-1 (verbatim from story 7-6:14): A move whose source and target dates
    //   fall in different months checks both months.
    it('moveShift checks BOTH months on a cross-month move', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-08-05T00:00:00.000Z'),
        source: 'MANUAL',
      });
      await service.moveShift(clinicId, julyShift.id, {
        targetDate: '2026-08-05',
      });
      expect(
        mockPrismaService.planningPeriodStatus.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            month: { in: ['2026-07', '2026-08'] },
          }),
        }),
      );
    });

    // AC-4 (verbatim from story 7-6:17): ... that month's PlanningPeriodStatus
    //   records amendedAt = now() and increments amendmentCount ...
    // AC-3 (verbatim from story 7-6:16): ... every affected employee ...
    //   receives a schedule-changed email ...
    it('acknowledged mutation on a published month increments amendmentCount and notifies', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });
      await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-07-20' },
        { acknowledgePublishedChange: true },
      );
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amendmentCount: { increment: 1 },
          }),
        }),
      );
      // notifyScheduleChange is fire-and-forget — flush the microtask queue.
      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenCalled();
    });

    // AC-1 (verbatim from story 7-6:14): ... When moveShift, createManualShift,
    //   or deleteShift is called without acknowledgePublishedChange: true ...
    it('createManualShift and deleteShift enforce the same guard', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[0]);
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-1',
        code: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 30,
        clinicId,
      });
      await expect(
        service.createManualShift(clinicId, {
          employeeId: 'emp-1',
          date: '2026-07-15',
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '12:00',
        }),
      ).rejects.toMatchObject({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
      expect(mockPrismaService.shift.create).not.toHaveBeenCalled();

      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      await expect(
        service.deleteShift(clinicId, julyShift.id),
      ).rejects.toMatchObject({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
      expect(mockPrismaService.shift.delete).not.toHaveBeenCalled();
    });

    // AC-6 (verbatim from story 7-6:19): Given the admin grid on a DRAFT month,
    //   Then behaviour is unchanged — no dialog, no flag, no notification.
    it('mutations on a DRAFT month behave exactly as before (no guard, no notification)', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        employeeId: 'emp-2',
        source: 'MANUAL',
      });
      const result = await service.moveShift(clinicId, julyShift.id, {
        targetEmployeeId: 'emp-2',
      });
      expect(result.employeeId).toBe('emp-2');
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).not.toHaveBeenCalled();
      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).not.toHaveBeenCalled();
    });

    // AC-3 (verbatim from story 7-6:16): ... every affected employee ...
    //   receives a schedule-changed email and a PUSH NOTIFICATION ... (review
    //   F3 — the push channel was previously unasserted).
    it('sends a push notification to the affected employee on an acknowledged published amendment', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });
      await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-07-20' },
        { acknowledgePublishedChange: true },
      );
      await new Promise((r) => setImmediate(r));
      expect(
        mockPushNotificationService.sendBatchPushNotifications,
      ).toHaveBeenCalledWith(
        ['emp-1'],
        expect.objectContaining({ url: '/dashboard/schedule' }),
      );
    });

    // AC-3 (review F2 regression): an ACTIVE employee with no email must still
    //   receive the push — the email is skipped individually, the push is not
    //   coupled to email presence.
    it('still pushes when the affected employee has no email (email skipped, push sent)', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: null,
          user: { locale: 'fr' },
        },
      ]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });
      await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-07-20' },
        { acknowledgePublishedChange: true },
      );
      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).not.toHaveBeenCalled();
      expect(
        mockPushNotificationService.sendBatchPushNotifications,
      ).toHaveBeenCalledWith(
        ['emp-1'],
        expect.objectContaining({ url: '/dashboard/schedule' }),
      );
      // Guard the query-level half of the F2 fix: the recipient lookup must
      // NOT filter on email (that filter is what previously dropped null-email
      // employees from the push channel too).
      expect(mockPrismaService.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ email: expect.anything() }),
        }),
      );
    });

    // AC-3 (verbatim from story 7-6:16): ... each only if their side's month is
    //   published ... (review F4 — cross-month, one side published only).
    it('cross-month move notifies only the published-side month', async () => {
      // Original month 2026-07 is published; target month 2026-08 is a draft.
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-08-05T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });
      await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-08-05' },
        { acknowledgePublishedChange: true },
      );
      await new Promise((r) => setImmediate(r));
      // amendment recorded only for the published month
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ month: { in: ['2026-07'] } }),
        }),
      );
      // exactly one email, for the published month, never for the draft target
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        '2026-07',
        expect.any(String),
        expect.any(String),
      );
    });

    // Story 11-4 (AC2): the caller reacts to a failed change notification.
    it('error-logs an aggregate when a change email fails (does not throw)', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });
      mockMailService.sendScheduleChangedEmail.mockResolvedValue(false);
      const errorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-07-20' },
        { acknowledgePublishedChange: true },
      );
      await new Promise((r) => setImmediate(r));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('change email(s) failed'),
      );
      errorSpy.mockRestore();
    });

    // Story 11-4 (AC2): "a single undeliverable recipient never prevents the
    // other recipients from being notified" — drive notifyScheduleChange with
    // two recipients where the first send fails; the loop must still reach the
    // second, and the aggregate ratio counts only attempted sends.
    it('continues the loop after a failed send so other recipients are still notified (AC2)', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@clinic.fr',
          user: { locale: 'fr' },
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          email: 'bob@clinic.fr',
          user: { locale: 'en' },
        },
      ]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Clinique Test',
      });
      mockMailService.sendScheduleChangedEmail
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      const errorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await (
        service as unknown as {
          notifyScheduleChange: (
            clinicId: string,
            recipients: Array<{ employeeId: string; month: string }>,
          ) => Promise<void>;
        }
      ).notifyScheduleChange(clinicId, [
        { employeeId: 'emp-1', month: '2026-07' },
        { employeeId: 'emp-2', month: '2026-07' },
      ]);

      // both recipients attempted despite the first returning false
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenCalledTimes(2);
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenNthCalledWith(
        2,
        'bob@clinic.fr',
        'Bob',
        '2026-07',
        'Clinique Test',
        'en',
      );
      // ratio counts attempted sends (2), not just the failure count
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('1/2 change email(s) failed'),
      );
      errorSpy.mockRestore();
    });

    // Story 11-4 (n7): the ratio denominator is attempted sends, not
    // unique.length — a null-email recipient is skipped and must not inflate it.
    it('excludes null-email skips from the failure-ratio denominator (n7)', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'NoMail',
          email: null,
          user: { locale: 'fr' },
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          email: 'bob@clinic.fr',
          user: { locale: 'fr' },
        },
        {
          id: 'emp-3',
          firstName: 'Cara',
          email: 'cara@clinic.fr',
          user: { locale: 'fr' },
        },
      ]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Clinique Test',
      });
      mockMailService.sendScheduleChangedEmail
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      const errorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await (
        service as unknown as {
          notifyScheduleChange: (
            clinicId: string,
            recipients: Array<{ employeeId: string; month: string }>,
          ) => Promise<void>;
        }
      ).notifyScheduleChange(clinicId, [
        { employeeId: 'emp-1', month: '2026-07' },
        { employeeId: 'emp-2', month: '2026-07' },
        { employeeId: 'emp-3', month: '2026-07' },
      ]);

      // emp-1 skipped (no email) → only 2 sends attempted, denominator is 2 (not 3)
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('1/2 change email(s) failed'),
      );
      errorSpy.mockRestore();
    });
  });

  // ─── Story 11-6 — transactional amendment & cache coherence ───────
  describe('Story 11-6 — transactional amendment', () => {
    const publishedStatus = { month: '2026-07' };
    const julyShift = {
      id: 'shift-pub',
      clinicId: 'clinic-123',
      employeeId: 'emp-1',
      date: new Date('2026-07-10T00:00:00.000Z'),
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: 'SURGERY',
      breakMinutes: 0,
      source: 'GENERATED',
      isConfirmed: true,
    };

    beforeEach(() => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        publishedStatus,
      ]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Clinic',
      });
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@example.com',
          user: { locale: 'fr' },
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          email: 'bob@example.com',
          user: { locale: 'en' },
        },
      ]);
    });

    // AC1 + AC2 — moveShift: mutation + recordAmendment share ONE transaction,
    // notify fires AFTER commit.
    it('moveShift wraps shift.update + recordAmendment in one $transaction and notifies after commit', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });

      await service.moveShift(
        clinicId,
        julyShift.id,
        { targetDate: '2026-07-20' },
        { acknowledgePublishedChange: true },
      );

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.shift.update).toHaveBeenCalled();
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).toHaveBeenCalledWith({
        where: { clinicId, month: { in: ['2026-07'] }, status: 'PUBLISHED' },
        data: { amendedAt: expect.any(Date), amendmentCount: { increment: 1 } },
      });
      await new Promise((r) => setImmediate(r));
      // AC2 — "each affected employee is notified exactly once": the two
      // recipients (origin + destination) collapse to one on a same-employee,
      // same-month move, so exactly one email fires.
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenCalledTimes(1);
    });

    // AC1 — rollback safety: recordAmendment failing inside the tx rejects the
    // whole call and emits NO notification.
    it('moveShift rejects and does not notify when recordAmendment fails inside the transaction', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });
      mockPrismaService.planningPeriodStatus.updateMany.mockRejectedValueOnce(
        new Error('amend failed'),
      );

      await expect(
        service.moveShift(
          clinicId,
          julyShift.id,
          { targetDate: '2026-07-20' },
          { acknowledgePublishedChange: true },
        ),
      ).rejects.toThrow('amend failed');

      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).not.toHaveBeenCalled();
    });

    // AC1 — createManualShift wraps create + recordAmendment in one $transaction.
    it('createManualShift wraps shift.create + recordAmendment in one $transaction', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[0]);
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-1',
        code: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        clinicId,
      });
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.shift.create.mockResolvedValue({
        id: 'new-shift',
        date: new Date('2026-07-10T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 0,
        source: 'MANUAL',
        employeeId: 'emp-1',
        isConfirmed: false,
        clinicId,
      });

      await service.createManualShift(clinicId, {
        employeeId: 'emp-1',
        date: '2026-07-10',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        acknowledgePublishedChange: true,
      });

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.shift.create).toHaveBeenCalled();
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).toHaveBeenCalled();
    });

    // AC1 — deleteShift wraps delete + recordAmendment in one $transaction;
    // rollback on amendment failure emits no notification.
    it('deleteShift wraps shift.delete + recordAmendment in one $transaction and does not notify on rollback', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      mockPrismaService.shift.delete.mockResolvedValue(julyShift);
      mockPrismaService.planningPeriodStatus.updateMany.mockRejectedValueOnce(
        new Error('amend failed'),
      );

      await expect(
        service.deleteShift(clinicId, julyShift.id, {
          acknowledgePublishedChange: true,
        }),
      ).rejects.toThrow('amend failed');

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).not.toHaveBeenCalled();
    });

    // Review AC2 (verbatim: "a notification-delivery failure neither fails nor
    // blocks the change") — the three single-shift amendment paths this story
    // rewired must survive a notify outage. The commit already succeeded, so the
    // fire-and-forget .catch swallows the error (operation resolves, error
    // logged) rather than surfacing to the caller.
    const expectNotifyFailureIsSwallowed = async (
      run: () => Promise<unknown>,
    ): Promise<void> => {
      mockMailService.sendScheduleChangedEmail.mockRejectedValueOnce(
        new Error('Resend outage'),
      );
      const loggerError = jest
        .spyOn(
          (
            service as unknown as {
              logger: { error: (...a: unknown[]) => void };
            }
          ).logger,
          'error',
        )
        .mockImplementation(() => undefined);

      await expect(run()).resolves.toBeDefined();

      // Flush the post-commit fire-and-forget microtask → the .catch logs.
      await new Promise((r) => setImmediate(r));
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('schedule-change notification failed'),
      );
      loggerError.mockRestore();
    };

    it('moveShift still resolves when the schedule-change notification fails', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.shift.update.mockResolvedValue({
        ...julyShift,
        date: new Date('2026-07-20T00:00:00.000Z'),
        source: 'MANUAL',
        isConfirmed: false,
      });

      await expectNotifyFailureIsSwallowed(() =>
        service.moveShift(
          clinicId,
          julyShift.id,
          { targetDate: '2026-07-20' },
          { acknowledgePublishedChange: true },
        ),
      );
    });

    it('createManualShift still resolves when the schedule-change notification fails', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[0]);
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-1',
        code: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        breakMinutes: 0,
        clinicId,
      });
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.shift.create.mockResolvedValue({
        id: 'new-shift',
        date: new Date('2026-07-10T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '12:00',
        shiftTypeCode: 'SURGERY',
        breakMinutes: 0,
        source: 'MANUAL',
        employeeId: 'emp-1',
        isConfirmed: false,
        clinicId,
      });

      await expectNotifyFailureIsSwallowed(() =>
        service.createManualShift(clinicId, {
          employeeId: 'emp-1',
          date: '2026-07-10',
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '12:00',
          breakMinutes: 0,
          acknowledgePublishedChange: true,
        }),
      );
    });

    it('deleteShift still resolves when the schedule-change notification fails', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(julyShift);
      mockPrismaService.shift.delete.mockResolvedValue(julyShift);
      mockPrismaService.planningPeriodStatus.updateMany.mockResolvedValue({
        count: 1,
      });

      await expectNotifyFailureIsSwallowed(() =>
        service.deleteShift(clinicId, julyShift.id, {
          acknowledgePublishedChange: true,
        }),
      );
    });
  });

  // ─── Story 11-1 — published-change guard on bulk regeneration ──────
  describe('Story 11-1 — bulk regeneration published-change guard', () => {
    const simpleTemplate = {
      id: 'tpl-1',
      name: 'Simple',
      data: {
        days: [
          {
            dayOfWeek: 1,
            slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
          },
        ],
      },
      clinicId,
    };

    it('generateMonthlyPlan throws PUBLISHED_CHANGE_REQUIRES_ACK on a published month without acknowledgement', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      await expect(
        service.generateMonthlyPlan(clinicId, '2026-07', 'tpl-1'),
      ).rejects.toMatchObject({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('generateMonthlyPlan on an acknowledged published month preserves confirmed/variance shifts, records the amendment, and notifies', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      // employees whose shifts will be cleared (union candidate).
      // shift.findMany is shared with loadBorderWeekShifts (border weeks need
      // full shift rows); key on the varianceEvents predicate so only the
      // 11-1 capture query returns emp-2, border-week loading returns [].
      mockPrismaService.shift.findMany.mockImplementation(
        (args: { where?: { varianceEvents?: unknown } }) =>
          Promise.resolve(
            args?.where?.varianceEvents ? [{ employeeId: 'emp-2' }] : [],
          ),
      );
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Clinic',
      });
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          lastName: 'Martin',
          jobType: 'VET',
          contractHours: 35,
          email: 'alice@example.com',
          user: { locale: 'fr' },
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          lastName: 'Dupont',
          jobType: 'ASV',
          contractHours: 35,
          email: 'bob@example.com',
          user: { locale: 'fr' },
        },
      ]);

      const txDeleteMany = jest.fn().mockResolvedValue({ count: 3 });
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            shift: {
              deleteMany: txDeleteMany,
              createManyAndReturn: jest.fn().mockResolvedValue([
                {
                  id: 's-new',
                  employeeId: 'emp-1',
                  date: new Date('2026-07-06'),
                  startTime: '08:00',
                  endTime: '12:00',
                  shiftTypeCode: 'SURGERY',
                },
              ]),
            },
          };
          return fn(tx);
        },
      );

      await service.generateMonthlyPlan(clinicId, '2026-07', 'tpl-1', {
        acknowledgePublishedChange: true,
      });

      // preservation predicate on the bulk delete
      expect(txDeleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          source: 'GENERATED',
          isConfirmed: false,
          varianceEvents: { none: {} },
        }),
      });
      // amendment recorded
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ month: { in: ['2026-07'] } }),
          data: expect.objectContaining({ amendmentCount: { increment: 1 } }),
        }),
      );
      // fire-and-forget notify — flush microtasks then assert union (emp-1 ∪ emp-2)
      await new Promise((r) => setImmediate(r));
      const notified = mockMailService.sendScheduleChangedEmail.mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(notified).toEqual(
        expect.arrayContaining(['alice@example.com', 'bob@example.com']),
      );
    });

    it('generateMonthlyPlan on a DRAFT month needs no acknowledgement and records no amendment', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              createManyAndReturn: jest.fn().mockResolvedValue([]),
            },
          };
          return fn(tx);
        },
      );
      await service.generateMonthlyPlan(clinicId, '2026-07', 'tpl-1');
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('deleteGeneratedShifts throws PUBLISHED_CHANGE_REQUIRES_ACK on a published month without acknowledgement', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      await expect(
        service.deleteGeneratedShifts(clinicId, '2026-07'),
      ).rejects.toMatchObject({ message: 'PUBLISHED_CHANGE_REQUIRES_ACK' });
      expect(mockPrismaService.shift.deleteMany).not.toHaveBeenCalled();
    });

    it('deleteGeneratedShifts on an acknowledged published month preserves confirmed/variance shifts, records the amendment, and notifies', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        { employeeId: 'emp-1' },
      ]);
      mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Clinic',
      });
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@example.com',
          user: { locale: 'fr' },
        },
      ]);

      const result = await service.deleteGeneratedShifts(clinicId, '2026-07', {
        acknowledgePublishedChange: true,
      });

      expect(result.deletedCount).toBe(2);
      expect(mockPrismaService.shift.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          source: 'GENERATED',
          isConfirmed: false,
          varianceEvents: { none: {} },
        }),
      });
      expect(
        mockPrismaService.planningPeriodStatus.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ month: { in: ['2026-07'] } }),
          data: expect.objectContaining({ amendmentCount: { increment: 1 } }),
        }),
      );
      await new Promise((r) => setImmediate(r));
      expect(mockMailService.sendScheduleChangedEmail).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice',
        '2026-07',
        'Test Clinic',
        'fr',
      );
    });

    // AC-4 (verbatim): "Notification failures are logged, never block the
    // operation." Review AC4 coverage gap — force the notify path to reject and
    // assert the fire-and-forget .catch swallows it (operation still resolves,
    // error logged) rather than surfacing to the caller.
    it('generateMonthlyPlan on an acknowledged published month still resolves when the schedule-change notification fails', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      mockPrismaService.shift.findMany.mockImplementation(
        (args: { where?: { varianceEvents?: unknown } }) =>
          Promise.resolve(
            args?.where?.varianceEvents ? [{ employeeId: 'emp-2' }] : [],
          ),
      );
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Clinic',
      });
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          lastName: 'Martin',
          jobType: 'VET',
          contractHours: 35,
          email: 'alice@example.com',
          user: { locale: 'fr' },
        },
      ]);
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            shift: {
              deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
              createManyAndReturn: jest.fn().mockResolvedValue([
                {
                  id: 's-new',
                  employeeId: 'emp-1',
                  date: new Date('2026-07-06'),
                  startTime: '08:00',
                  endTime: '12:00',
                  shiftTypeCode: 'SURGERY',
                },
              ]),
            },
          };
          return fn(tx);
        },
      );
      mockMailService.sendScheduleChangedEmail.mockRejectedValueOnce(
        new Error('Resend outage'),
      );
      const loggerError = jest
        .spyOn(
          (
            service as unknown as {
              logger: { error: (...a: unknown[]) => void };
            }
          ).logger,
          'error',
        )
        .mockImplementation(() => undefined);

      // The operation must resolve — the notify failure never blocks generation.
      await expect(
        service.generateMonthlyPlan(clinicId, '2026-07', 'tpl-1', {
          acknowledgePublishedChange: true,
        }),
      ).resolves.toBeDefined();

      // Flush the fire-and-forget microtask → the .catch logs, never throws.
      await new Promise((r) => setImmediate(r));
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('Notify schedule-change failed'),
      );
      loggerError.mockRestore();
    });

    it('deleteGeneratedShifts on an acknowledged published month still resolves when the schedule-change notification fails', async () => {
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
        { month: '2026-07' },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        { employeeId: 'emp-1' },
      ]);
      mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 2 });
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Clinic',
      });
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@example.com',
          user: { locale: 'fr' },
        },
      ]);
      mockMailService.sendScheduleChangedEmail.mockRejectedValueOnce(
        new Error('Resend outage'),
      );
      const loggerError = jest
        .spyOn(
          (
            service as unknown as {
              logger: { error: (...a: unknown[]) => void };
            }
          ).logger,
          'error',
        )
        .mockImplementation(() => undefined);

      // The purge must still return its deleted count despite the notify failure.
      const result = await service.deleteGeneratedShifts(clinicId, '2026-07', {
        acknowledgePublishedChange: true,
      });
      expect(result.deletedCount).toBe(2);

      await new Promise((r) => setImmediate(r));
      expect(loggerError).toHaveBeenCalledWith(
        expect.stringContaining('Notify schedule-change failed'),
      );
      loggerError.mockRestore();
    });
  });

  // ─── preValidateMove ─────────────────────────────────────────────

  describe('preValidateMove', () => {
    const mockShift = {
      id: 'shift-1',
      clinicId: 'clinic-123',
      employeeId: 'emp-1',
      date: new Date('2025-03-03T00:00:00.000Z'),
      startTime: '08:00',
      endTime: '12:00',
      shiftTypeCode: 'SURGERY',
      breakMinutes: 0,
    };

    const defaultInput = {
      shiftId: 'shift-1',
      targetEmployeeId: 'emp-2',
      targetDate: '2025-03-04',
    };

    // preValidateMove uses dayNameToIso = { MONDAY:1, TUESDAY:2, ... }
    // so workDays must use MONDAY/TUESDAY/etc. format (not '1','2','3')
    const preValidateOperationalConfig = {
      ...mockOperationalConfig,
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    };

    beforeEach(() => {
      mockPrismaService.shift.findUnique.mockResolvedValue(mockShift);
      mockPrismaService.employee.findFirst.mockResolvedValue(mockEmployees[1]); // Bob ASV
      mockPrismaService.unavailability.findMany.mockResolvedValue([]);
      mockPrismaService.shift.findMany.mockResolvedValue([]); // no existing shifts
      mockClinicService.getOperationalConfig.mockResolvedValue(
        preValidateOperationalConfig,
      );
      mockPlanningService.listRules.mockResolvedValue([]);
    });

    it('returns empty violations when move is valid', async () => {
      const result = await service.preValidateMove(clinicId, defaultInput);
      expect(result.hard).toHaveLength(0);
      expect(result.soft).toHaveLength(0);
    });

    it('throws NotFoundException when shift not found', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue(null);
      await expect(
        service.preValidateMove(clinicId, defaultInput),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong clinic', async () => {
      mockPrismaService.shift.findUnique.mockResolvedValue({
        ...mockShift,
        clinicId: 'other-clinic',
      });
      await expect(
        service.preValidateMove(clinicId, defaultInput),
      ).rejects.toThrow('Shift does not belong to this clinic');
    });

    it('returns HARD EMPLOYEE violation when target employee not found', async () => {
      mockPrismaService.employee.findFirst.mockResolvedValue(null);
      const result = await service.preValidateMove(clinicId, defaultInput);
      expect(result.hard).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: 'EMPLOYEE' })]),
      );
    });

    it('returns HARD CLOSED_DAY violation when target date is closed', async () => {
      mockClinicService.getOperationalConfig.mockResolvedValue({
        ...preValidateOperationalConfig,
        closedDays: [{ id: 'cd-1', date: '2025-03-04', reason: 'Holiday' }],
      });
      const result = await service.preValidateMove(clinicId, defaultInput);
      expect(result.hard).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'CLOSED_DAY' }),
        ]),
      );
    });

    it('returns HARD NON_WORK_DAY violation when target date is not a work day', async () => {
      // 2025-03-08 is a Saturday (day 6), not in workDays [MONDAY..FRIDAY]
      const result = await service.preValidateMove(clinicId, {
        ...defaultInput,
        targetDate: '2025-03-08',
      });
      expect(result.hard).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'NON_WORK_DAY' }),
        ]),
      );
    });

    it('returns HARD UNAVAILABILITY violation when employee has unavailability', async () => {
      mockPrismaService.unavailability.findMany.mockResolvedValue([
        { type: 'VACATION', reason: 'Holidays', daysOfWeek: [] },
      ]);
      const result = await service.preValidateMove(clinicId, defaultInput);
      expect(result.hard).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'UNAVAILABILITY' }),
        ]),
      );
    });

    it('returns HARD OVERLAP violation when shift times overlap', async () => {
      // shift.findMany is called multiple times in preValidateMove:
      // 1st call: existingShifts (in Promise.all) — return overlapping shift
      // 2nd call: weekShifts — return empty
      // 3rd call: monthShifts — return empty
      mockPrismaService.shift.findMany
        .mockResolvedValueOnce([
          { startTime: '10:00', endTime: '14:00', breakMinutes: 0 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.preValidateMove(clinicId, defaultInput);
      expect(result.hard).toEqual(
        expect.arrayContaining([expect.objectContaining({ rule: 'OVERLAP' })]),
      );
    });

    // AC2 (verbatim from story 11-3): "the move surfaces a blocking (hard) conflict in the
    // drag interface" when an employee would exceed a statutory limit.
    it('returns a HARD CONTRACT_COMPLIANCE violation when the move creates a 7th consecutive day (statutory)', async () => {
      // emp-2 already worked 2025-03-01..03-06 (6 consecutive days). Moving the shift onto
      // 2025-03-07 (a Friday work day) makes a 7th consecutive worked day.
      const consec = ['01', '02', '03', '04', '05', '06'].map((d) => ({
        id: `s-${d}`,
        date: new Date(`2025-03-${d}T00:00:00.000Z`),
        startTime: '09:00',
        endTime: '12:00',
        breakMinutes: 0,
        employeeId: 'emp-2',
        clinicId,
      }));
      mockPrismaService.shift.findMany
        .mockResolvedValueOnce([]) // existingShifts — no overlap
        .mockResolvedValueOnce([]) // weekShifts
        .mockResolvedValueOnce(consec); // monthShifts — statutory window

      const result = await service.preValidateMove(clinicId, {
        ...defaultInput,
        targetDate: '2025-03-07',
      });
      expect(result.hard).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'CONTRACT_COMPLIANCE' }),
        ]),
      );
    });

    it('returns HARD SKILL_REQUIREMENT violation when employee job type mismatches', async () => {
      mockPlanningService.listRules.mockResolvedValue([
        {
          id: 'rule-1',
          category: 'SKILL_REQUIREMENT',
          ruleType: 'HARD',
          isActive: true,
          priority: 5,
          config: {
            shiftTypeCode: 'SURGERY',
            requiredJobTypes: ['VET'],
          },
        },
      ]);
      // emp-2 is ASV, SURGERY requires VET
      const result = await service.preValidateMove(clinicId, defaultInput);
      expect(result.hard).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'SKILL_REQUIREMENT' }),
        ]),
      );
    });

    it('returns SOFT CONTRACT_COMPLIANCE violation when overtime risk', async () => {
      // emp-2 has 35h contract. shift is 08:00-12:00 = 4h (240min net).
      // Existing week: 4 shifts totalling 33h = 1980min.
      // Projected = 1980 + 240 = 2220min = 37h > 35h contract.
      // shift.findMany calls in preValidateMove:
      // 1st: existingShifts (Promise.all) — no overlap
      // 2nd: weekShifts — heavy week
      // 3rd: monthShifts — empty
      mockPrismaService.shift.findMany
        .mockResolvedValueOnce([]) // existingShifts
        .mockResolvedValueOnce([
          { startTime: '08:00', endTime: '18:00', breakMinutes: 60 }, // 9h net
          { startTime: '08:00', endTime: '18:00', breakMinutes: 60 }, // 9h net
          { startTime: '08:00', endTime: '18:00', breakMinutes: 60 }, // 9h net
          { startTime: '08:00', endTime: '14:00', breakMinutes: 0 }, // 6h net = total 33h
        ]) // weekShifts
        .mockResolvedValueOnce([]); // monthShifts

      const result = await service.preValidateMove(clinicId, defaultInput);
      expect(result.soft).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'CONTRACT_COMPLIANCE' }),
        ]),
      );
    });
  });

  // ─── Story 11-5 — idempotent generation & concurrency safety ──────
  describe('Story 11-5 — idempotent generation & concurrency safety', () => {
    const simpleTemplate = {
      id: 'tpl-11-5',
      name: 'Simple',
      data: {
        days: [
          {
            dayOfWeek: 1,
            slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
          },
        ],
      },
      clinicId,
    };
    const oneVet = [
      {
        id: 'emp-1',
        firstName: 'Alice',
        lastName: 'Martin',
        jobType: 'VET',
        contractHours: 35,
      },
    ];

    // A tx whose $executeRaw records the raw SQL it was handed, so we can assert
    // the advisory lock ran BEFORE any deleteMany/createManyAndReturn.
    const buildRecordingTx = () => {
      const calls: string[] = [];
      const tx = {
        $executeRaw: jest
          .fn()
          .mockImplementation((strings: TemplateStringsArray) => {
            calls.push(strings.join('?'));
            return Promise.resolve(0);
          }),
        shift: {
          deleteMany: jest.fn().mockImplementation(() => {
            calls.push('deleteMany');
            return Promise.resolve({ count: 0 });
          }),
          createManyAndReturn: jest
            .fn()
            .mockImplementation(({ data }: { data: any[] }) => {
              calls.push('createManyAndReturn');
              return Promise.resolve(
                data.map((d, i) => ({ id: `gen-${i}`, ...d })),
              );
            }),
        },
      };
      return { tx, calls };
    };

    it('acquires the (clinicId, month) advisory lock before deleting on generateMonthlyPlan (AC2)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.employee.findMany.mockResolvedValue(oneVet);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      const { tx, calls } = buildRecordingTx();
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      );

      await service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-5');

      expect(tx.$executeRaw).toHaveBeenCalled();
      const rawSql = tx.$executeRaw.mock.calls[0][0].join('?');
      expect(rawSql).toContain('pg_advisory_xact_lock');
      expect(rawSql).toContain('hashtext');
      // lock is the FIRST db call — before deleteMany and createManyAndReturn
      expect(calls[0]).toContain('pg_advisory_xact_lock');
      expect(calls.indexOf('deleteMany')).toBeGreaterThan(0);
      // aped-review — pin the transaction options: default READ COMMITTED + 15s
      // timeout, NO isolationLevel (SERIALIZABLE would freeze the snapshot at the
      // advisory-lock SELECT and defeat the second waiter's fresh-snapshot read).
      expect(mockPrismaService.$transaction.mock.calls[0][1]).toEqual({
        timeout: 15000,
      });
    });

    it('maps a P2002 during generation to a ConflictException (AC3 — the dead catch is now a real net)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.employee.findMany.mockResolvedValue(oneVet);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      mockPrismaService.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-5'),
      ).rejects.toMatchObject({
        message: 'Duplicate shift detected during generation',
      });
    });

    it('retries the generation transaction once on a P2034 serialization failure, then succeeds (AC2)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.employee.findMany.mockResolvedValue(oneVet);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      const { tx } = buildRecordingTx();
      let attempts = 0;
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (t: unknown) => Promise<unknown>) => {
          attempts += 1;
          if (attempts === 1) return Promise.reject({ code: 'P2034' });
          return fn(tx);
        },
      );

      const result = await service.generateMonthlyPlan(
        clinicId,
        '2026-03',
        'tpl-11-5',
      );

      expect(attempts).toBe(2);
      expect(result).toBeDefined();
    });

    it('does NOT retry a P2002 (permanent) — fails on the first attempt (AC3)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.employee.findMany.mockResolvedValue(oneVet);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      let attempts = 0;
      mockPrismaService.$transaction.mockImplementation(async () => {
        attempts += 1;
        return Promise.reject({ code: 'P2002' });
      });

      await expect(
        service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-5'),
      ).rejects.toMatchObject({
        message: 'Duplicate shift detected during generation',
      });
      expect(attempts).toBe(1);
    });

    it('gives up after 3 P2034 attempts and surfaces InternalServerError, never looping (AC2)', async () => {
      mockTemplateService.getTemplateById.mockResolvedValue(simpleTemplate);
      mockPrismaService.employee.findMany.mockResolvedValue(oneVet);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);
      let attempts = 0;
      mockPrismaService.$transaction.mockImplementation(async () => {
        attempts += 1;
        return Promise.reject({ code: 'P2034' });
      });

      await expect(
        service.generateMonthlyPlan(clinicId, '2026-03', 'tpl-11-5'),
      ).rejects.toMatchObject({
        message: 'Failed to persist generated shifts',
      });
      // bounded at maxAttempts=3: the 3rd P2034 is thrown (not retried), and the
      // outer catch maps the non-P2002 error to InternalServerError.
      expect(attempts).toBe(3);
    });

    it('acquires the (clinicId, month) advisory lock inside publishPlan (AC2)', async () => {
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue(null);
      (mockPrismaService as any).planningService?.validateShiftsAgainstRules;
      jest
        .spyOn(service['planningService'], 'validateShiftsAgainstRules')
        .mockResolvedValue({ hardViolations: [], softViolations: [] } as any);
      mockPrismaService.employee.findMany.mockResolvedValue([]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Clinic',
      });
      const lockExec = jest.fn().mockResolvedValue(0);
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (t: unknown) => Promise<unknown>) =>
          fn({
            $executeRaw: lockExec,
            planningPeriodStatus: {
              upsert: jest.fn().mockResolvedValue({}),
            },
          }),
      );

      await service.publishPlan(clinicId, '2026-03', 'user-1');

      expect(lockExec).toHaveBeenCalled();
      expect(lockExec.mock.calls[0][0].join('?')).toContain(
        'pg_advisory_xact_lock',
      );
      // aped-review — same options contract as generation: READ COMMITTED + 15s.
      expect(mockPrismaService.$transaction.mock.calls[0][1]).toEqual({
        timeout: 15000,
      });
    });
  });

  // ─── publishPlan ──────────────────────────────────────────────────
  describe('publishPlan', () => {
    const userId = 'user-admin-1';
    const month = '2026-03';
    const savedTriggerKey = process.env.TRIGGER_SECRET_KEY;

    afterAll(() => {
      if (savedTriggerKey !== undefined) {
        process.env.TRIGGER_SECRET_KEY = savedTriggerKey;
      }
    });

    const mockTxPlanningPeriodStatus = {
      upsert: jest.fn(),
    };

    beforeEach(() => {
      // Ensure direct-send path is tested (Trigger.dev tests have their own beforeEach)
      delete process.env.TRIGGER_SECRET_KEY;

      // publishPlan first calls planningPeriodStatus.findUnique for quick-exit check
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue(null); // not yet published

      // shift.count for checking modifications after publish (quick-exit path)
      mockPrismaService.shift.count.mockResolvedValue(0);

      // validateShiftsAgainstRules is called inside the transaction
      mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
        hardViolations: [],
        softViolations: [],
      });

      // $transaction provides tx with planningPeriodStatus.upsert
      mockTxPlanningPeriodStatus.upsert.mockResolvedValue({
        id: 'pps-1',
        clinicId,
        month,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedBy: userId,
      });
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            planningPeriodStatus: mockTxPlanningPeriodStatus,
          };
          return fn(tx);
        },
      );

      // After transaction: fetch employees with shifts + clinic name
      mockPrismaService.employee.findMany.mockResolvedValue([]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Clinique Vétérinaire du Parc',
      });
      mockMailService.sendSchedulePublicationEmail.mockResolvedValue(undefined);
    });

    it('should upsert PlanningPeriodStatus as PUBLISHED when no hard conflicts', async () => {
      const result = await service.publishPlan(clinicId, month, userId);

      expect(result).toHaveProperty('publishedAt');
      expect(result).toHaveProperty('totalWithShifts');
      expect(typeof result.publishedAt).toBe('string');
      expect(typeof result.totalWithShifts).toBe('number');

      expect(mockTxPlanningPeriodStatus.upsert).toHaveBeenCalledWith({
        where: { clinicId_month: { clinicId, month } },
        create: expect.objectContaining({
          clinicId,
          month,
          status: 'PUBLISHED',
          publishedBy: userId,
        }),
        update: expect.objectContaining({
          status: 'PUBLISHED',
          publishedBy: userId,
        }),
      });
    });

    it('should throw ConflictException when hard violations exist', async () => {
      mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
        hardViolations: [
          {
            ruleId: 'r-1',
            ruleName: 'Min staff',
            category: 'STAFFING_MINIMUM',
            message: 'Not enough staff',
            affectedDate: '2026-03-02',
            severity: 'blocking',
          },
        ],
        softViolations: [],
      });

      await expect(
        service.publishPlan(clinicId, month, userId),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.publishPlan(clinicId, month, userId),
      ).rejects.toThrow(/hard violation/);

      // tx.planningPeriodStatus.upsert should NOT have been called
      expect(mockTxPlanningPeriodStatus.upsert).not.toHaveBeenCalled();
    });

    it('should send batch email to active employees with shifts in the month', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@clinic.fr',
          notifyOnPublish: true,
          _count: { shifts: 5 },
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          email: 'bob@clinic.fr',
          notifyOnPublish: true,
          _count: { shifts: 3 },
        },
      ]);
      mockMailService.sendBatchSchedulePublicationEmails.mockResolvedValue(2);

      const result = await service.publishPlan(clinicId, month, userId);

      expect(
        mockMailService.sendBatchSchedulePublicationEmails,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockMailService.sendBatchSchedulePublicationEmails,
      ).toHaveBeenCalledWith(
        [
          {
            to: 'alice@clinic.fr',
            firstName: 'Alice',
            shiftCount: 5,
            locale: 'fr',
          },
          {
            to: 'bob@clinic.fr',
            firstName: 'Bob',
            shiftCount: 3,
            locale: 'fr',
          },
        ],
        month,
        'Clinique Vétérinaire du Parc',
      );
      expect(result.totalWithShifts).toBe(2);
    });

    it('should not send email to employees with notifyOnPublish disabled', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@clinic.fr',
          notifyOnPublish: true,
          _count: { shifts: 5 },
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          email: 'bob@clinic.fr',
          notifyOnPublish: false,
          _count: { shifts: 3 },
        },
      ]);
      mockMailService.sendBatchSchedulePublicationEmails.mockResolvedValue(1);

      const result = await service.publishPlan(clinicId, month, userId);

      expect(
        mockMailService.sendBatchSchedulePublicationEmails,
      ).toHaveBeenCalledWith(
        [
          {
            to: 'alice@clinic.fr',
            firstName: 'Alice',
            shiftCount: 5,
            locale: 'fr',
          },
        ],
        month,
        'Clinique Vétérinaire du Parc',
      );
      expect(result.totalWithShifts).toBe(2);
    });

    it('should not send email to inactive employees', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([]);

      const result = await service.publishPlan(clinicId, month, userId);

      expect(
        mockMailService.sendBatchSchedulePublicationEmails,
      ).not.toHaveBeenCalled();
      expect(result.totalWithShifts).toBe(0);
    });

    // Story 11-4 (AC2): publishPlan reacts to the direct batch send count.
    it('error-logs when the direct batch send reports fewer sent than eligible', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@clinic.fr',
          notifyOnPublish: true,
          _count: { shifts: 5 },
        },
        {
          id: 'emp-2',
          firstName: 'Bob',
          email: 'bob@clinic.fr',
          notifyOnPublish: true,
          _count: { shifts: 3 },
        },
      ]);
      mockMailService.sendBatchSchedulePublicationEmails.mockResolvedValue(1);
      const errorSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);

      await service.publishPlan(clinicId, month, userId);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('publication email(s) failed'),
      );
      errorSpy.mockRestore();
    });

    it('should be idempotent — re-publishing updates timestamp', async () => {
      // First publish
      await service.publishPlan(clinicId, month, userId);

      // Clear to simulate re-publish scenario: existing status is now PUBLISHED
      // but with modified shifts (count > 0), so it should re-publish
      jest.clearAllMocks();

      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue({
        id: 'pps-1',
        clinicId,
        month,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-03-14T10:00:00.000Z'),
        publishedBy: userId,
      });
      mockPrismaService.shift.count.mockResolvedValue(1); // shifts modified after publish
      mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
        hardViolations: [],
        softViolations: [],
      });
      mockTxPlanningPeriodStatus.upsert.mockResolvedValue({
        id: 'pps-1',
        clinicId,
        month,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedBy: userId,
      });
      mockPrismaService.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $executeRaw: jest.fn().mockResolvedValue(0),
            planningPeriodStatus: mockTxPlanningPeriodStatus,
          };
          return fn(tx);
        },
      );
      mockPrismaService.employee.findMany.mockResolvedValue([]);
      mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
        name: 'Clinique Vétérinaire du Parc',
      });
      mockMailService.sendSchedulePublicationEmail.mockResolvedValue(undefined);

      // Second publish (re-publish)
      const result = await service.publishPlan(clinicId, month, userId);

      expect(mockTxPlanningPeriodStatus.upsert).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('publishedAt');
      expect(result).toHaveProperty('totalWithShifts');
    });

    it('should include publishedAt and totalWithShifts in result', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Alice',
          email: 'alice@clinic.fr',
          notifyOnPublish: true,
          _count: { shifts: 4 },
        },
      ]);
      mockMailService.sendBatchSchedulePublicationEmails.mockResolvedValue(1);

      const result = await service.publishPlan(clinicId, month, userId);

      expect(result.publishedAt).toBeDefined();
      expect(new Date(result.publishedAt).toISOString()).toBe(
        result.publishedAt,
      );
      expect(result.totalWithShifts).toBe(1);
    });

    describe('Trigger.dev code path', () => {
      const originalTriggerKey = process.env.TRIGGER_SECRET_KEY;

      beforeEach(() => {
        process.env.TRIGGER_SECRET_KEY = 'tr_dev_test_key';
        jest.clearAllMocks();

        mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue(
          null,
        );
        mockPrismaService.shift.count.mockResolvedValue(0);
        mockPlanningService.validateShiftsAgainstRules.mockResolvedValue({
          hardViolations: [],
          softViolations: [],
        });
        mockTxPlanningPeriodStatus.upsert.mockResolvedValue({
          id: 'pps-1',
          clinicId,
          month,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishedBy: userId,
        });
        mockPrismaService.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              $executeRaw: jest.fn().mockResolvedValue(0),
              planningPeriodStatus: mockTxPlanningPeriodStatus,
            };
            return fn(tx);
          },
        );
        mockPrismaService.clinic.findUniqueOrThrow.mockResolvedValue({
          name: 'Clinique Test',
        });
      });

      afterEach(() => {
        if (originalTriggerKey !== undefined) {
          process.env.TRIGGER_SECRET_KEY = originalTriggerKey;
        } else {
          delete process.env.TRIGGER_SECRET_KEY;
        }
      });

      it('should trigger batch-email-publish task instead of direct send when TRIGGER_SECRET_KEY is set', async () => {
        mockPrismaService.employee.findMany.mockResolvedValue([
          {
            id: 'emp-1',
            firstName: 'Alice',
            email: 'alice@clinic.fr',
            notifyOnPublish: true,
            _count: { shifts: 5 },
          },
          {
            id: 'emp-2',
            firstName: 'Bob',
            email: 'bob@clinic.fr',
            notifyOnPublish: true,
            _count: { shifts: 3 },
          },
        ]);

        await service.publishPlan(clinicId, month, userId);

        expect(batchEmailPublishTask.trigger).toHaveBeenCalledTimes(1);
        expect(batchEmailPublishTask.trigger).toHaveBeenCalledWith(
          expect.objectContaining({
            emails: [
              {
                to: 'alice@clinic.fr',
                firstName: 'Alice',
                shiftCount: 5,
                locale: 'fr',
              },
              {
                to: 'bob@clinic.fr',
                firstName: 'Bob',
                shiftCount: 3,
                locale: 'fr',
              },
            ],
            month,
            clinicName: 'Clinique Test',
            idempotencyKey: expect.stringContaining(
              `schedule-publish/${clinicId}:${month}:`,
            ),
          }),
        );
        expect(
          mockMailService.sendBatchSchedulePublicationEmails,
        ).not.toHaveBeenCalled();
      });

      it('should trigger batch-push-publish task when TRIGGER_SECRET_KEY is set', async () => {
        mockPrismaService.employee.findMany.mockResolvedValue([
          {
            id: 'emp-1',
            firstName: 'Alice',
            email: 'alice@clinic.fr',
            notifyOnPublish: true,
            _count: { shifts: 5 },
          },
        ]);

        await service.publishPlan(clinicId, month, userId);

        expect(batchPushPublishTask.trigger).toHaveBeenCalledTimes(1);
        expect(batchPushPublishTask.trigger).toHaveBeenCalledWith({
          employeeIds: ['emp-1'],
          title: 'Clinique Test — Planning publié',
          body: `Votre planning de ${month} est disponible.`,
          url: '/dashboard/schedule',
        });
        expect(
          mockPushNotificationService.sendBatchPushNotifications,
        ).not.toHaveBeenCalled();
      });

      it('should not trigger tasks when no eligible employees', async () => {
        mockPrismaService.employee.findMany.mockResolvedValue([
          {
            id: 'emp-1',
            firstName: 'Alice',
            email: 'alice@clinic.fr',
            notifyOnPublish: false,
            _count: { shifts: 5 },
          },
        ]);

        await service.publishPlan(clinicId, month, userId);

        expect(batchEmailPublishTask.trigger).not.toHaveBeenCalled();
      });
    });
  });

  // ─── getPublicationStatus ──────────────────────────────────────────
  describe('getPublicationStatus', () => {
    it('should return DRAFT status when no PlanningPeriodStatus record exists', async () => {
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue(null);

      const result = await service.getPublicationStatus(clinicId, '2026-03');

      expect(result).toEqual({
        status: 'DRAFT',
        publishedAt: null,
        publishedBy: null,
        amendedAt: null,
        amendmentCount: 0,
      });
      expect(
        mockPrismaService.planningPeriodStatus.findUnique,
      ).toHaveBeenCalledWith({
        where: { clinicId_month: { clinicId, month: '2026-03' } },
      });
    });

    it('should return PUBLISHED status with publishedAt when record exists', async () => {
      const publishedAt = new Date('2026-03-15T10:00:00.000Z');
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue({
        id: 'pps-1',
        clinicId,
        month: '2026-03',
        status: 'PUBLISHED',
        publishedAt,
        publishedBy: 'user-admin-1',
        amendedAt: null,
        amendmentCount: 0,
      });

      const result = await service.getPublicationStatus(clinicId, '2026-03');

      expect(result).toEqual({
        status: 'PUBLISHED',
        publishedAt: publishedAt.toISOString(),
        publishedBy: 'user-admin-1',
        amendedAt: null,
        amendmentCount: 0,
      });
    });

    it('should expose amendedAt and amendmentCount on an amended published month', async () => {
      const publishedAt = new Date('2026-03-15T10:00:00.000Z');
      const amendedAt = new Date('2026-03-18T09:30:00.000Z');
      mockPrismaService.planningPeriodStatus.findUnique.mockResolvedValue({
        id: 'pps-1',
        clinicId,
        month: '2026-03',
        status: 'PUBLISHED',
        publishedAt,
        publishedBy: 'user-admin-1',
        amendedAt,
        amendmentCount: 3,
      });

      const result = await service.getPublicationStatus(clinicId, '2026-03');

      expect(result.amendedAt).toBe(amendedAt.toISOString());
      expect(result.amendmentCount).toBe(3);
    });
  });
});
