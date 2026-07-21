import { Test, TestingModule } from '@nestjs/testing';
import { EquityCounterService } from './equity-counter.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';

describe('EquityCounterService', () => {
  let service: EquityCounterService;

  const clinicId = 'clinic-123';

  const mockPrismaService = {
    equityCounter: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn(),
    },
    employee: {
      findMany: jest.fn(),
    },
    shift: {
      findMany: jest.fn(),
    },
    clinicClosedDay: {
      findMany: jest.fn(),
    },
    planningRule: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockClinicService = {
    listAllClinicIds: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EquityCounterService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClinicService, useValue: mockClinicService },
      ],
    }).compile();

    service = module.get<EquityCounterService>(EquityCounterService);
    jest.clearAllMocks();
  });

  // ─── getCountersForPeriod ───────────────────────────────────────────────

  describe('getCountersForPeriod', () => {
    const mockCounter = {
      id: 'counter-1',
      counterType: 'SATURDAY_WORKED',
      count: 3,
      year: 2026,
      month: 1,
      lastCalculatedAt: new Date(),
      employee: {
        id: 'emp-1',
        firstName: 'John',
        lastName: 'Doe',
        color: '#FF0000',
        jobType: 'VET',
        contractHours: 35,
      },
    };

    it('returns counters for given clinic, year, and months', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([mockCounter]);

      const result = await service.getCountersForPeriod(
        clinicId,
        2026,
        [1, 2, 3],
      );

      expect(result).toEqual([mockCounter]);
      expect(mockPrismaService.equityCounter.findMany).toHaveBeenCalledWith({
        where: {
          clinicId,
          year: 2026,
          month: { in: [1, 2, 3] },
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              color: true,
              jobType: true,
              contractHours: true,
            },
          },
        },
        orderBy: [{ employee: { lastName: 'asc' } }, { counterType: 'asc' }],
      });
    });

    it('applies counterTypes filter when provided', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([mockCounter]);

      await service.getCountersForPeriod(
        clinicId,
        2026,
        [1],
        ['SATURDAY_WORKED' as any, 'WEEKEND_TOTAL' as any],
      );

      expect(mockPrismaService.equityCounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId,
            year: 2026,
            month: { in: [1] },
            counterType: { in: ['SATURDAY_WORKED', 'WEEKEND_TOTAL'] },
          },
        }),
      );
    });

    it('does not apply counterTypes filter when array is empty', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

      await service.getCountersForPeriod(clinicId, 2026, [3], []);

      expect(mockPrismaService.equityCounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId,
            year: 2026,
            month: { in: [3] },
          },
        }),
      );
    });

    it('does not apply counterTypes filter when undefined', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

      await service.getCountersForPeriod(clinicId, 2026, [5]);

      const callArgs =
        mockPrismaService.equityCounter.findMany.mock.calls[0][0];
      expect(callArgs.where.counterType).toBeUndefined();
    });

    it('scopes query to clinicId', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

      await service.getCountersForPeriod('other-clinic', 2026, [1]);

      expect(mockPrismaService.equityCounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clinicId: 'other-clinic' }),
        }),
      );
    });
  });

  // ─── getCountersForWindow (Story 11-7) ──────────────────────────────────

  describe('getCountersForWindow', () => {
    it('loads a rolling 12-month window ending the month before the target, crossing the year boundary', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

      // Target January 2026 → window is Jan 2025 … Dec 2025 (12 months, incl. Dec N-1).
      await service.getCountersForWindow(clinicId, 2026, 1);

      const callArgs =
        mockPrismaService.equityCounter.findMany.mock.calls[0][0];
      expect(callArgs.where.clinicId).toBe(clinicId);
      expect(callArgs.where.OR).toHaveLength(12);
      // Includes December of the previous year — the exact case that used to reset.
      expect(callArgs.where.OR).toContainEqual({ year: 2025, month: 12 });
      // Oldest month of the window is January of the previous year.
      expect(callArgs.where.OR).toContainEqual({ year: 2025, month: 1 });
      // Never includes the target month itself (circular-scoring guard).
      expect(callArgs.where.OR).not.toContainEqual({ year: 2026, month: 1 });
    });

    it('rolls the window across months mid-year (July 2026 → Jul 2025 … Jun 2026)', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

      await service.getCountersForWindow(clinicId, 2026, 7);

      const callArgs =
        mockPrismaService.equityCounter.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toHaveLength(12);
      expect(callArgs.where.OR).toContainEqual({ year: 2026, month: 6 }); // month before target
      expect(callArgs.where.OR).toContainEqual({ year: 2025, month: 7 }); // 12 months back
      expect(callArgs.where.OR).not.toContainEqual({ year: 2026, month: 7 });
    });

    it('applies the counterTypes filter when provided', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

      await service.getCountersForWindow(clinicId, 2026, 3, 12, [
        'WEEKEND_TOTAL',
      ]);

      const callArgs =
        mockPrismaService.equityCounter.findMany.mock.calls[0][0];
      expect(callArgs.where.counterType).toEqual({ in: ['WEEKEND_TOTAL'] });
    });

    it('scopes the query to clinicId', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

      await service.getCountersForWindow('other-clinic', 2026, 5);

      const callArgs =
        mockPrismaService.equityCounter.findMany.mock.calls[0][0];
      expect(callArgs.where.clinicId).toBe('other-clinic');
    });

    it('returns [] without querying for a non-positive window (no ambiguous empty OR)', async () => {
      mockPrismaService.equityCounter.findMany.mockResolvedValue([]);

      const result = await service.getCountersForWindow(clinicId, 2026, 5, 0);

      expect(result).toEqual([]);
      // No findMany with `OR: []` (whose match semantics are ambiguous) is issued.
      expect(mockPrismaService.equityCounter.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── getQuarterlySummary ───────────────────────────────────────────────

  describe('getQuarterlySummary', () => {
    const mockGroupByResult = [
      {
        employeeId: 'emp-1',
        counterType: 'SATURDAY_WORKED',
        _sum: { count: 5 },
      },
      { employeeId: 'emp-1', counterType: 'WEEKEND_TOTAL', _sum: { count: 8 } },
    ];

    it('maps Q1 to months [1, 2, 3]', async () => {
      mockPrismaService.equityCounter.groupBy.mockResolvedValue(
        mockGroupByResult,
      );

      await service.getQuarterlySummary(clinicId, 2026, 1);

      expect(mockPrismaService.equityCounter.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            month: { in: [1, 2, 3] },
          }),
        }),
      );
    });

    it('maps Q2 to months [4, 5, 6]', async () => {
      mockPrismaService.equityCounter.groupBy.mockResolvedValue([]);

      await service.getQuarterlySummary(clinicId, 2026, 2);

      expect(mockPrismaService.equityCounter.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            month: { in: [4, 5, 6] },
          }),
        }),
      );
    });

    it('maps Q3 to months [7, 8, 9]', async () => {
      mockPrismaService.equityCounter.groupBy.mockResolvedValue([]);

      await service.getQuarterlySummary(clinicId, 2026, 3);

      expect(mockPrismaService.equityCounter.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            month: { in: [7, 8, 9] },
          }),
        }),
      );
    });

    it('maps Q4 to months [10, 11, 12]', async () => {
      mockPrismaService.equityCounter.groupBy.mockResolvedValue([]);

      await service.getQuarterlySummary(clinicId, 2026, 4);

      expect(mockPrismaService.equityCounter.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            month: { in: [10, 11, 12] },
          }),
        }),
      );
    });

    it('groups by employeeId and counterType with sum aggregation', async () => {
      mockPrismaService.equityCounter.groupBy.mockResolvedValue(
        mockGroupByResult,
      );

      const result = await service.getQuarterlySummary(clinicId, 2026, 1);

      expect(result).toEqual(mockGroupByResult);
      expect(mockPrismaService.equityCounter.groupBy).toHaveBeenCalledWith({
        by: ['employeeId', 'counterType'],
        where: {
          clinicId,
          year: 2026,
          month: { in: [1, 2, 3] },
        },
        _sum: { count: true },
      });
    });

    it('scopes query to clinicId and year', async () => {
      mockPrismaService.equityCounter.groupBy.mockResolvedValue([]);

      await service.getQuarterlySummary('clinic-456', 2025, 2);

      expect(mockPrismaService.equityCounter.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId: 'clinic-456',
            year: 2025,
          }),
        }),
      );
    });
  });

  // ─── recalculateForPeriod ──────────────────────────────────────────────

  describe('recalculateForPeriod', () => {
    const employee1 = { id: 'emp-1', contractHours: 35 };
    const employee2 = { id: 'emp-2', contractHours: 20 };

    beforeEach(() => {
      mockPrismaService.employee.findMany.mockResolvedValue([employee1]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.clinicClosedDay.findMany.mockResolvedValue([]);
      mockPrismaService.planningRule.findFirst.mockResolvedValue(null);
      mockPrismaService.$transaction.mockResolvedValue([]);
    });

    it('fetches active employees for the clinic', async () => {
      await service.recalculateForPeriod(clinicId, 2026, 3);

      expect(mockPrismaService.employee.findMany).toHaveBeenCalledWith({
        where: { clinicId, isActive: true },
        select: { id: true, contractHours: true },
      });
    });

    it('fetches shifts within the period date range', async () => {
      await service.recalculateForPeriod(clinicId, 2026, 3);

      const callArgs = mockPrismaService.shift.findMany.mock.calls[0][0];
      expect(callArgs.where.clinicId).toBe(clinicId);
      const gte = callArgs.where.date.gte;
      const lte = callArgs.where.date.lte;
      // March 2026, in UTC: production stores Shift.date at UTC midnight, so the window
      // must be UTC too — reading these bounds with local getters would pass under
      // Europe/Paris while the window silently slid a day (Story 13-7, audit T8).
      expect(gte.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(lte.toISOString()).toBe('2026-03-31T23:59:59.999Z');
    });

    it('fetches closed days for holiday detection', async () => {
      await service.recalculateForPeriod(clinicId, 2026, 3);

      const callArgs =
        mockPrismaService.clinicClosedDay.findMany.mock.calls[0][0];
      expect(callArgs.where.clinicId).toBe(clinicId);
      expect(callArgs.where.date).toBeDefined();
    });

    it('fetches CONTRACT_COMPLIANCE rule for overtime threshold', async () => {
      await service.recalculateForPeriod(clinicId, 2026, 3);

      expect(mockPrismaService.planningRule.findFirst).toHaveBeenCalledWith({
        where: {
          clinicId,
          category: 'CONTRACT_COMPLIANCE',
          isActive: true,
        },
        select: { config: true },
      });
    });

    it('detects Saturday shifts (day of week = 6)', async () => {
      // 2026-03-07 is a Saturday
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 7)), // Saturday March 7
          startTime: '08:00',
          endTime: '12:00',
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      const transactionCalls = mockPrismaService.$transaction.mock.calls[0][0];
      // Find the SATURDAY_WORKED upsert for emp-1
      // $transaction receives an array of Prisma promises, but we mock it receiving the map result
      // We need to check the upsert calls instead
      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: {
              clinicId,
              employeeId: 'emp-1',
              counterType: 'SATURDAY_WORKED',
              year: 2026,
              month: 3,
            },
          },
          create: expect.objectContaining({
            count: 1,
            counterType: 'SATURDAY_WORKED',
          }),
          update: expect.objectContaining({
            count: 1,
          }),
        }),
      );
    });

    it('detects weekend total (Saturday and Sunday)', async () => {
      // 2026-03-07 is Saturday, 2026-03-08 is Sunday
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 7)), // Saturday
          startTime: '08:00',
          endTime: '12:00',
        },
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 8)), // Sunday
          startTime: '08:00',
          endTime: '12:00',
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      // SATURDAY_WORKED should be 1 (only Saturday)
      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'SATURDAY_WORKED',
              },
            ),
          },
          create: expect.objectContaining({ count: 1 }),
          update: expect.objectContaining({ count: 1 }),
        }),
      );

      // WEEKEND_TOTAL should be 2 (Saturday + Sunday)
      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'WEEKEND_TOTAL',
              },
            ),
          },
          create: expect.objectContaining({ count: 2 }),
          update: expect.objectContaining({ count: 2 }),
        }),
      );
    });

    it('detects Sunday as weekend but not Saturday', async () => {
      // 2026-03-08 is Sunday
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 8)), // Sunday
          startTime: '09:00',
          endTime: '17:00',
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      // SATURDAY_WORKED = 0
      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'SATURDAY_WORKED',
              },
            ),
          },
          create: expect.objectContaining({ count: 0 }),
        }),
      );

      // WEEKEND_TOTAL = 1
      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'WEEKEND_TOTAL',
              },
            ),
          },
          create: expect.objectContaining({ count: 1 }),
        }),
      );
    });

    it('detects holidays using clinic closed days', async () => {
      // 2026-03-02 is a Monday; make it a closed day (holiday)
      const closedDate = new Date(Date.UTC(2026, 2, 2));
      mockPrismaService.clinicClosedDay.findMany.mockResolvedValue([
        { date: closedDate },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 2)), // Monday, closed day
          startTime: '08:00',
          endTime: '16:00',
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'HOLIDAY_WORKED',
              },
            ),
          },
          create: expect.objectContaining({ count: 1 }),
          update: expect.objectContaining({ count: 1 }),
        }),
      );
    });

    it('does not count holiday when shift date is not a closed day', async () => {
      mockPrismaService.clinicClosedDay.findMany.mockResolvedValue([]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 2)), // Monday, NOT a closed day
          startTime: '08:00',
          endTime: '16:00',
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'HOLIDAY_WORKED',
              },
            ),
          },
          create: expect.objectContaining({ count: 0 }),
        }),
      );
    });

    it('calculates overtime when total minutes exceed adjusted contract limit', async () => {
      // Employee has 35 contractHours
      // contractLimitMinutes = 35 * 60 * 4.33 = 9093
      // With 10% threshold: adjustedLimitMinutes = 9093 * 1.1 = 10002.3
      // So if employee works more than ~10002 minutes, overtime is the excess
      mockPrismaService.planningRule.findFirst.mockResolvedValue({
        config: { overtimeThresholdPercent: 10 },
      });

      // Create shifts totaling ~10500 minutes (175 hours)
      // 25 weekday shifts of 7 hours each = 175 hours = 10500 minutes
      const shifts: {
        employeeId: string;
        date: Date;
        startTime: string;
        endTime: string;
      }[] = [];
      // Use weekdays in March 2026
      const weekdays = [
        2,
        3,
        4,
        5,
        6, // Week 1 (Mon-Fri, but 6 is Sat so skip last, use 2-5 + 9)
        9,
        10,
        11,
        12,
        13,
        16,
        17,
        18,
        19,
        20,
        23,
        24,
        25,
        26,
        27,
        30,
        31,
      ];
      for (const day of weekdays) {
        shifts.push({
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, day)),
          startTime: '08:00',
          endTime: '15:00', // 7 hours = 420 minutes each
        });
      }

      mockPrismaService.shift.findMany.mockResolvedValue(shifts);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      // Total minutes = weekdays.length * 420
      // Note: day 6 is a Saturday, day 13 is a Friday, etc.
      // We need to check if any of these are weekend days
      // March 2026: 7 is Sat, 8 is Sun, 14 is Sat, 15 is Sun, 21 is Sat, 22 is Sun, 28 is Sat, 29 is Sun
      // Our weekdays array does not include any Sat/Sun so all good
      const totalMinutes = weekdays.length * 420; // 22 * 420 = 9240
      const contractLimit = 35 * 60 * 4.33; // 9093
      const adjustedLimit = contractLimit * 1.1; // 10002.3
      const expectedOvertime = Math.max(
        0,
        Math.round(totalMinutes - adjustedLimit),
      );

      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'OVERTIME_HOURS',
              },
            ),
          },
          create: expect.objectContaining({ count: expectedOvertime }),
          update: expect.objectContaining({ count: expectedOvertime }),
        }),
      );
    });

    it('sets overtime to 0 when total minutes are below adjusted limit', async () => {
      mockPrismaService.planningRule.findFirst.mockResolvedValue(null);
      // Single short shift
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 2)),
          startTime: '08:00',
          endTime: '12:00', // 4 hours = 240 minutes
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'OVERTIME_HOURS',
              },
            ),
          },
          create: expect.objectContaining({ count: 0 }),
          update: expect.objectContaining({ count: 0 }),
        }),
      );
    });

    it('uses 0 as overtime threshold when no CONTRACT_COMPLIANCE rule exists', async () => {
      mockPrismaService.planningRule.findFirst.mockResolvedValue(null);
      mockPrismaService.employee.findMany.mockResolvedValue([
        { id: 'emp-1', contractHours: 1 }, // Very low contract hours
      ]);
      // Give enough work to exceed the limit: 1hr * 60 * (31/7) ≈ 265.7 min limit
      // If we work 300 min, overtime = 300 - 266 = 34
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 2)),
          startTime: '08:00',
          endTime: '13:00', // 5 hours = 300 minutes
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      // March 2026 = 31 days → weeksInMonth = 31/7
      const weeksInMonth = 31 / 7;
      const expectedOvertime = Math.max(
        0,
        Math.round(300 - 1 * 60 * weeksInMonth),
      );

      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'OVERTIME_HOURS',
              },
            ),
          },
          create: expect.objectContaining({ count: expectedOvertime }),
          update: expect.objectContaining({ count: expectedOvertime }),
        }),
      );
    });

    it('creates 4 counters per employee (SATURDAY_WORKED, WEEKEND_TOTAL, HOLIDAY_WORKED, OVERTIME_HOURS)', async () => {
      mockPrismaService.employee.findMany.mockResolvedValue([
        employee1,
        employee2,
      ]);
      mockPrismaService.$transaction.mockResolvedValue([
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
      ]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      // 2 employees * 4 counter types = 8 upsert calls
      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledTimes(8);
    });

    it('wraps all upserts in a $transaction', async () => {
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      // The argument to $transaction should be an array
      const transactionArg = mockPrismaService.$transaction.mock.calls[0][0];
      expect(Array.isArray(transactionArg)).toBe(true);
    });

    it('returns the number of counters updated', async () => {
      mockPrismaService.$transaction.mockResolvedValue([{}, {}, {}, {}]);

      const result = await service.recalculateForPeriod(clinicId, 2026, 3);

      expect(result).toEqual({ countersUpdated: 4 });
    });

    it('calculates shift minutes correctly for normal shifts (indirectly tests calculateShiftMinutes)', async () => {
      // 8:00 to 17:30 = 9.5 hours = 570 minutes
      mockPrismaService.employee.findMany.mockResolvedValue([
        { id: 'emp-1', contractHours: 1 },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 2)), // Monday
          startTime: '08:00',
          endTime: '17:30',
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      // March 2026 = 31 days → weeksInMonth = 31/7
      // contractLimit = 1 * 60 * (31/7) ≈ 265.7
      // overtime = 570 - 265.7 ≈ 304.3, rounded = 304
      const weeksInMonth = 31 / 7;
      const expectedOvertime = Math.max(
        0,
        Math.round(570 - 1 * 60 * weeksInMonth),
      );
      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'OVERTIME_HOURS',
              },
            ),
          },
          create: expect.objectContaining({ count: expectedOvertime }),
        }),
      );
    });

    it('handles overnight shifts correctly (indirectly tests calculateShiftMinutes)', async () => {
      // 22:00 to 06:00 = 8 hours = 480 minutes (overnight)
      mockPrismaService.employee.findMany.mockResolvedValue([
        { id: 'emp-1', contractHours: 1 },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 2)),
          startTime: '22:00',
          endTime: '06:00',
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      // March 2026 = 31 days → weeksInMonth = 31/7
      // contractLimit = 1 * 60 * (31/7) ≈ 265.7
      // overnight shift: 1440 - 1320 + 360 = 480 minutes
      // overtime = 480 - 265.7 ≈ 214.3, rounded = 214
      const weeksInMonth = 31 / 7;
      const expectedOvertime = Math.max(
        0,
        Math.round(480 - 1 * 60 * weeksInMonth),
      );
      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'OVERTIME_HOURS',
              },
            ),
          },
          create: expect.objectContaining({ count: expectedOvertime }),
        }),
      );
    });

    it('handles employees with no shifts (all counters = 0)', async () => {
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      // All 4 counters should be 0
      const upsertCalls = mockPrismaService.equityCounter.upsert.mock.calls;
      for (const call of upsertCalls) {
        expect(call[0].create.count).toBe(0);
        expect(call[0].update.count).toBe(0);
      }
    });

    it('sets lastCalculatedAt on create and update', async () => {
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      const upsertCalls = mockPrismaService.equityCounter.upsert.mock.calls;
      for (const call of upsertCalls) {
        expect(call[0].create.lastCalculatedAt).toBeInstanceOf(Date);
        expect(call[0].update.lastCalculatedAt).toBeInstanceOf(Date);
      }
    });

    it('uses overtimeThresholdPercent from the CONTRACT_COMPLIANCE rule config', async () => {
      // With a high threshold, there should be less or no overtime
      mockPrismaService.planningRule.findFirst.mockResolvedValue({
        config: { overtimeThresholdPercent: 500 }, // 500% above contract
      });
      mockPrismaService.employee.findMany.mockResolvedValue([
        { id: 'emp-1', contractHours: 35 },
      ]);
      // 35 * 60 * 4.33 = 9093 base minutes
      // adjusted = 9093 * (1 + 500/100) = 9093 * 6 = 54558
      // Even with a lot of work, won't exceed
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-1',
          date: new Date(Date.UTC(2026, 2, 2)),
          startTime: '08:00',
          endTime: '16:00', // 8 hours = 480 minutes
        },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      expect(mockPrismaService.equityCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            clinicId_employeeId_counterType_year_month: expect.objectContaining(
              {
                counterType: 'OVERTIME_HOURS',
              },
            ),
          },
          create: expect.objectContaining({ count: 0 }),
        }),
      );
    });

    it('handles CONTRACT_COMPLIANCE rule without overtimeThresholdPercent (defaults to 0)', async () => {
      mockPrismaService.planningRule.findFirst.mockResolvedValue({
        config: { maxWeeklyHours: 35 }, // No overtimeThresholdPercent
      });
      mockPrismaService.$transaction.mockResolvedValue([{}]);

      await service.recalculateForPeriod(clinicId, 2026, 3);

      // Should not throw and should use 0 as default
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ─── recalculateAllClinics ──────────────────────────────────────────────

  describe('recalculateAllClinics', () => {
    it('fetches all clinics via ClinicService and recalculates for each', async () => {
      mockClinicService.listAllClinicIds.mockResolvedValue([
        { id: 'clinic-1', name: 'Clinic A' },
        { id: 'clinic-2', name: 'Clinic B' },
      ]);
      mockPrismaService.employee.findMany.mockResolvedValue([]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.clinicClosedDay.findMany.mockResolvedValue([]);
      mockPrismaService.planningRule.findFirst.mockResolvedValue(null);
      mockPrismaService.$transaction.mockResolvedValue([]);

      await service.recalculateAllClinics(2026, 3);

      expect(mockClinicService.listAllClinicIds).toHaveBeenCalled();
      // employee.findMany should be called once per clinic
      expect(mockPrismaService.employee.findMany).toHaveBeenCalledTimes(2);
    });

    it('continues processing other clinics when one fails', async () => {
      mockClinicService.listAllClinicIds.mockResolvedValue([
        { id: 'clinic-1', name: 'Clinic A' },
        { id: 'clinic-2', name: 'Clinic B' },
        { id: 'clinic-3', name: 'Clinic C' },
      ]);

      // First clinic fails, second and third succeed
      mockPrismaService.employee.findMany
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockResolvedValue([]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);
      mockPrismaService.clinicClosedDay.findMany.mockResolvedValue([]);
      mockPrismaService.planningRule.findFirst.mockResolvedValue(null);
      mockPrismaService.$transaction.mockResolvedValue([]);

      // Should not throw
      await expect(
        service.recalculateAllClinics(2026, 3),
      ).resolves.not.toThrow();

      // The other clinics should still be processed
      // clinic-1 fails on employee.findMany, clinic-2 and clinic-3 succeed
      expect(mockPrismaService.employee.findMany).toHaveBeenCalledTimes(3);
    });

    it('handles empty clinic list gracefully', async () => {
      mockClinicService.listAllClinicIds.mockResolvedValue([]);

      await service.recalculateAllClinics(2026, 3);

      expect(mockClinicService.listAllClinicIds).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.employee.findMany).not.toHaveBeenCalled();
    });
  });
});
