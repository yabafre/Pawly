import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    validateShiftsAgainstRules: jest.fn(),
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

  // Access private methods via type cast for unit testing
  const callPrivate = (method: string, ...args: unknown[]) =>
    (service as any)[method](...args);

  describe('expandTemplateToMonth', () => {
    const shiftTypeMap = new Map([
      ['SURGERY', { startTime: '08:00', endTime: '12:00', breakMinutes: 0 }],
      ['RECEPTION', { startTime: '08:00', endTime: '18:00', breakMinutes: 0 }],
    ]);

    it('correctly maps template days to calendar dates for March 2026', () => {
      const slots = callPrivate('expandTemplateToMonth',
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

      const slots = callPrivate('expandTemplateToMonth',
        mockTemplate,
        '2026-03',
        configWithClosed,
        shiftTypeMap,
      );

      const march2Slots = slots.filter((s) => s.date === '2026-03-02');
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

      const slots = callPrivate('expandTemplateToMonth',
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
      const feb = callPrivate('expandTemplateToMonth',
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
      const mar = callPrivate('expandTemplateToMonth',
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

      const slots = callPrivate('expandTemplateToMonth',
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

      const constraints = await callPrivate('loadConstraints',
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

      const constraints = await callPrivate('loadConstraints',
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

      const constraints = await callPrivate('loadConstraints',
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

      const constraints = await callPrivate('loadConstraints',
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

    it('assigns employees to a slot', () => {
      const slot = {
        date: '2026-03-02',
        shiftTypeCode: 'SURGERY',
        startTime: '08:00',
        endTime: '12:00',
        requiredStaff: 2,
      };

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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
        { employeeId: 'emp-1', date: '2026-03-02', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
        { employeeId: 'emp-1', date: '2026-03-03', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
        { employeeId: 'emp-1', date: '2026-03-04', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
        { employeeId: 'emp-2', date: '2026-03-02', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
      ];

      const assignmentIndex = new Map<string, any[]>();
      for (const a of alreadyAssigned) {
        const key = `${a.employeeId}|${a.date}`;
        const existing = assignmentIndex.get(key) || [];
        existing.push(a);
        assignmentIndex.set(key, existing);
      }

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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
      const result = callPrivate('scoreAndAssign',
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
        { employeeId: 'emp-2', date: '2026-03-09', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
        { employeeId: 'emp-2', date: '2026-03-10', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
        { employeeId: 'emp-3', date: '2026-03-09', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
        { employeeId: 'emp-3', date: '2026-03-10', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
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

      const result = callPrivate('scoreAndAssign',
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
        { date: '2026-03-02', shiftTypeCode: 'VET', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Monday
        { date: '2026-03-03', shiftTypeCode: 'VET', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Tuesday
        { date: '2026-03-07', shiftTypeCode: 'CHIR', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Saturday
      ];

      const reordered = callPrivate('reorderSlotsNonWorkDaysFirst', slots, workDaySet);

      // Saturday should come first (non-work day)
      expect(reordered[0].date).toBe('2026-03-07');
      expect(reordered[1].date).toBe('2026-03-02');
      expect(reordered[2].date).toBe('2026-03-03');
    });

    it('maintains chronological order across different weeks', () => {
      const slots = [
        { date: '2026-03-02', shiftTypeCode: 'VET', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Week 1 Mon
        { date: '2026-03-07', shiftTypeCode: 'CHIR', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Week 1 Sat
        { date: '2026-03-09', shiftTypeCode: 'VET', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Week 2 Mon
        { date: '2026-03-14', shiftTypeCode: 'CHIR', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Week 2 Sat
      ];

      const reordered = callPrivate('reorderSlotsNonWorkDaysFirst', slots, workDaySet);

      // Week 1: Saturday first, then Monday
      expect(reordered[0].date).toBe('2026-03-07'); // Week 1 Sat
      expect(reordered[1].date).toBe('2026-03-02'); // Week 1 Mon
      // Week 2: Saturday first, then Monday
      expect(reordered[2].date).toBe('2026-03-14'); // Week 2 Sat
      expect(reordered[3].date).toBe('2026-03-09'); // Week 2 Mon
    });

    it('uses dynamic workDays config — Wednesday off is processed first', () => {
      // Clinic works Mon, Tue, Thu, Fri, Sat — Wednesday is off
      const customWorkDays = new Set([1, 2, 4, 5, 6]);
      const slots = [
        { date: '2026-03-02', shiftTypeCode: 'VET', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Monday (work)
        { date: '2026-03-04', shiftTypeCode: 'VET', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Wednesday (off)
        { date: '2026-03-07', shiftTypeCode: 'CHIR', startTime: '08:00', endTime: '18:00', requiredStaff: 1 }, // Saturday (work)
      ];

      const reordered = callPrivate('reorderSlotsNonWorkDaysFirst', slots, customWorkDays);

      // Wednesday (non-work day) should come first, then the work days in date order
      expect(reordered[0].date).toBe('2026-03-04'); // Wed (non-work)
      expect(reordered[1].date).toBe('2026-03-02'); // Mon (work)
      expect(reordered[2].date).toBe('2026-03-07'); // Sat (work)
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
        const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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
        { employeeId: 'emp-1', date: '2026-03-07', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
        { employeeId: 'emp-1', date: '2026-03-14', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
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

      const result = callPrivate('scoreAndAssign',
        slot,
        mockEmployees.filter(e => e.jobType === 'VET'), // emp-1 and emp-3
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

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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
        { employeeId: 'emp-1', date: '2026-03-12', startTime: '18:00', endTime: '20:00', shiftTypeCode: 'SURGERY' },
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

      const result = callPrivate('scoreAndAssign',
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
        { employeeId: 'emp-1', date: '2026-03-07', startTime: '08:00', endTime: '12:00', shiftTypeCode: 'SURGERY' },
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
      const result = callPrivate('scoreAndAssign',
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
        { id: 'emp-part', firstName: 'Luna', lastName: 'Part', jobType: 'ASV', contractHours: 25 },
        { id: 'emp-full', firstName: 'Max', lastName: 'Full', jobType: 'ASV', contractHours: 35 },
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

      const result = callPrivate('scoreAndAssign',
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
        { id: 'emp-pt', firstName: 'Lea', lastName: 'Short', jobType: 'ASV', contractHours: 25 },
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

      const result = callPrivate('scoreAndAssign',
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

      const result = callPrivate('scoreAndAssign',
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
      expect(result.softViolations.some(
        (v: any) => v.category === 'STAFFING_MINIMUM',
      )).toBe(true);
    });
  });

  // ─── getScheduleViewForMonth ────────────────────────────────────

  describe('getScheduleViewForMonth', () => {
    // Override operational config with full day names matching ClinicConfig format
    const scheduleOperationalConfig = {
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
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
        { id: 'emp-2', firstName: 'Bob', lastName: 'Dupont', color: null, jobType: 'ASV', contractHours: 35 },
        { id: 'emp-3', firstName: 'Charlie', lastName: 'Leroy', color: null, jobType: 'VET', contractHours: 35 },
        { id: 'emp-1', firstName: 'Alice', lastName: 'Martin', color: null, jobType: 'VET', contractHours: 35 },
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
        source: 'GENERATED',
        employeeId: 'emp-1',
        isConfirmed: false,
      });

      expect(result.shifts[1]).toEqual({
        id: 'shift-2',
        date: '2026-02-03',
        startTime: '08:00',
        endTime: '18:00',
        shiftTypeCode: 'RECEPTION',
        source: 'MANUAL',
        employeeId: 'emp-2',
        isConfirmed: true,
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

      // Should detect holes for Mondays where only 1 of 2 required staff assigned
      expect(result.holes.length).toBeGreaterThan(0);
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
});
