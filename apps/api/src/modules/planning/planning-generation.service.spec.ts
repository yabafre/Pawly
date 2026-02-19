import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlanningGenerationService } from './planning-generation.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';
import { PlanningService } from './planning.service';
import { PlanningTemplateService } from './planning-template.service';
import { EquityCounterService } from './equity-counter.service';
import type { TemplateData } from '@pawly/validators';

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
    closedDays: [] as Array<{ id: string; date: string; reason: string | null }>,
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
    employee: { findMany: jest.fn() },
    unavailability: { findMany: jest.fn() },
    shift: {
      findMany: jest.fn(),
      createManyAndReturn: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockClinicService = {
    getOperationalConfig: jest.fn(),
    listShiftTypes: jest.fn(),
  };

  const mockPlanningService = {
    listRules: jest.fn(),
  };

  const mockTemplateService = {
    getTemplateById: jest.fn(),
  };

  const mockEquityService = {
    getCountersForPeriod: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningGenerationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClinicService, useValue: mockClinicService },
        { provide: PlanningService, useValue: mockPlanningService },
        {
          provide: PlanningTemplateService,
          useValue: mockTemplateService,
        },
        {
          provide: EquityCounterService,
          useValue: mockEquityService,
        },
      ],
    }).compile();

    service = module.get<PlanningGenerationService>(
      PlanningGenerationService,
    );
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
    mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 0 });
  });

  // ─── expandTemplateToMonth ───────────────────────────────────

  describe('expandTemplateToMonth', () => {
    const shiftTypeMap = new Map([
      ['SURGERY', { startTime: '08:00', endTime: '12:00' }],
      ['RECEPTION', { startTime: '08:00', endTime: '18:00' }],
    ]);

    it('correctly maps template days to calendar dates for March 2026', () => {
      const slots = service.expandTemplateToMonth(
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
        closedDays: [
          { id: 'cd-1', date: '2026-03-02', reason: 'Holiday' },
        ],
      };

      const slots = service.expandTemplateToMonth(
        mockTemplate,
        '2026-03',
        configWithClosed,
        shiftTypeMap,
      );

      const march2Slots = slots.filter((s) => s.date === '2026-03-02');
      expect(march2Slots.length).toBe(0);
    });

    it('applies special day hour overrides', () => {
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

      const slots = service.expandTemplateToMonth(
        mockTemplate,
        '2026-03',
        configWithSpecial,
        shiftTypeMap,
      );

      const march2Slots = slots.filter((s) => s.date === '2026-03-02');
      expect(march2Slots.length).toBe(2);
      expect(march2Slots[0].startTime).toBe('09:00');
      expect(march2Slots[0].endTime).toBe('14:00');
    });

    it('handles months with 4 and 5 weeks correctly', () => {
      // February 2026: 28 days, starts on Sunday
      // Mon: 2,9,16,23 → 4 Mondays
      const feb = service.expandTemplateToMonth(
        mockTemplate,
        '2026-02',
        mockOperationalConfig,
        shiftTypeMap,
      );
      const febMondays = feb.filter(
        (s) =>
          new Date(`${s.date}T00:00:00Z`).getUTCDay() === 1,
      );
      expect(febMondays.length).toBe(8); // 4 Mondays × 2 slots

      // March 2026 has 5 Mondays
      const mar = service.expandTemplateToMonth(
        mockTemplate,
        '2026-03',
        mockOperationalConfig,
        shiftTypeMap,
      );
      const marMondays = mar.filter(
        (s) =>
          new Date(`${s.date}T00:00:00Z`).getUTCDay() === 1,
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

      const slots = service.expandTemplateToMonth(
        templateWithSaturday,
        '2026-03',
        mockOperationalConfig, // workDays: 1-5, no Saturday
        shiftTypeMap,
      );

      // March 2026 Saturdays: 7,14,21,28 → 4
      expect(slots.length).toBe(4);
      expect(
        slots.every(
          (s) =>
            new Date(`${s.date}T00:00:00Z`).getUTCDay() === 6,
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

      const constraints = await service.loadConstraints(
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

      const constraints = await service.loadConstraints(
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

    it('separates HARD and SOFT rules', async () => {
      mockPlanningService.listRules.mockResolvedValue([
        {
          id: 'r1',
          name: 'Hard',
          ruleType: 'HARD',
          category: 'STAFFING_MINIMUM',
          config: {},
        },
        {
          id: 'r2',
          name: 'Soft',
          ruleType: 'SOFT',
          category: 'ROTATION_EQUITY',
          config: {},
        },
      ]);

      const constraints = await service.loadConstraints(
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

  // ─── scoreAndAssign ─────────────────────────────────────────

  describe('scoreAndAssign', () => {
    const baseConstraints = {
      unavailableMap: new Map<string, Set<string>>(),
      hardRules: [] as Array<{
        id: string;
        name: string;
        category: string;
        config: Record<string, unknown>;
      }>,
      softRules: [] as Array<{
        id: string;
        name: string;
        category: string;
        config: Record<string, unknown>;
      }>,
      equityMap: new Map(),
    };

    it('assigns employees to a slot', () => {
      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 2,
      };

      const result = service.scoreAndAssign(
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

      const result = service.scoreAndAssign(
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

      const assignmentIndex = new Map([
        [`emp-1|2026-03-02`, alreadyAssigned],
      ]);

      const result = service.scoreAndAssign(
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

      const result = service.scoreAndAssign(
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

      const result = service.scoreAndAssign(
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

      const result = service.scoreAndAssign(
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

      mockPrismaService.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          shift: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createManyAndReturn: jest.fn().mockResolvedValue(createdShifts),
          },
        };
        return fn(tx);
      });

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

      mockPrismaService.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          shift: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createManyAndReturn: jest.fn().mockResolvedValue([]),
          },
        };
        return fn(tx);
      });

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
  });

  // ─── deleteGeneratedShifts ────────────────────────────────

  describe('deleteGeneratedShifts', () => {
    it('only removes GENERATED source shifts', async () => {
      mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.deleteGeneratedShifts(
        clinicId,
        '2026-03',
      );

      expect(result.deletedCount).toBe(5);
      expect(
        mockPrismaService.shift.deleteMany,
      ).toHaveBeenCalledWith({
        where: expect.objectContaining({
          clinicId,
          source: 'GENERATED',
        }),
      });
    });

    it('preserves MANUAL shifts (only deletes GENERATED)', async () => {
      mockPrismaService.shift.deleteMany.mockResolvedValue({ count: 0 });

      await service.deleteGeneratedShifts(clinicId, '2026-03');

      const callArgs =
        mockPrismaService.shift.deleteMany.mock.calls[0][0];
      expect(callArgs.where.source).toBe('GENERATED');
    });
  });

  // ─── HARD rule violations ────────────────────────────────

  describe('HARD rule evaluation in scoreAndAssign', () => {
    it('records hard violation when STAFFING_MINIMUM not met', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r1',
            name: 'Min 3 staff',
            category: 'STAFFING_MINIMUM',
            config: { shiftTypeCode: 'SURGERY', minStaff: 5 },
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
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

      const result = service.scoreAndAssign(
        slot,
        mockEmployees,
        constraints,
        [],
        new Map(),
        new Map(),
      );

      expect(result.hardViolations.length).toBeGreaterThan(0);
      expect(result.hardViolations[0].severity).toBe('blocking');
      // H1: Hard violations now block assignment
      expect(result.assigned.length).toBe(0);
      expect(result.holeInfo).toBeDefined();
      expect(result.holeInfo!.reason).toContain('Hard rule violated');
    });

    it('records hard violation when SKILL_REQUIREMENT missing', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        hardRules: [
          {
            id: 'r1',
            name: 'Need INTERN',
            category: 'SKILL_REQUIREMENT',
            config: {
              shiftTypeCode: 'SURGERY',
              requiredJobTypes: ['INTERN'],
            },
          },
        ],
        softRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
        }>,
        equityMap: new Map(),
      };

      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 1,
      };

      const result = service.scoreAndAssign(
        slot,
        mockEmployees,
        constraints,
        [],
        new Map(),
        new Map(),
      );

      expect(result.hardViolations.length).toBe(1);
      expect(result.hardViolations[0].message).toContain('INTERN');
      // H1: Hard violations now block assignment
      expect(result.assigned.length).toBe(0);
      expect(result.holeInfo).toBeDefined();
      expect(result.holeInfo!.reason).toContain('Hard rule violated');
    });
  });

  // ─── SOFT rule warnings ─────────────────────────────────

  describe('SOFT rule evaluation in scoreAndAssign', () => {
    it('records soft warning for ROTATION_EQUITY violation', () => {
      const constraints = {
        unavailableMap: new Map<string, Set<string>>(),
        hardRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
        }>,
        softRules: [
          {
            id: 'r1',
            name: 'Max 2 Saturdays',
            category: 'ROTATION_EQUITY',
            config: { targetDay: 'saturday', maxPerPeriod: 1 },
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

      const result = service.scoreAndAssign(
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
        hardRules: [] as Array<{
          id: string;
          name: string;
          category: string;
          config: Record<string, unknown>;
        }>,
        softRules: [
          {
            id: 'r1',
            name: 'Max hours',
            category: 'CONTRACT_COMPLIANCE',
            config: { maxMonthlyHours: 1 },
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

      const result = service.scoreAndAssign(
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
});
