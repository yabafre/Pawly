import { BadRequestException } from '@nestjs/common';
import { EmployeeScheduleService } from './employee-schedule.service';

describe('EmployeeScheduleService', () => {
  let service: EmployeeScheduleService;

  const clinicId = 'clinic-123';
  const employeeId = 'emp-1';

  const mockEmployee = {
    id: employeeId,
    firstName: 'Marie',
    lastName: 'Dupont',
    jobType: 'VET',
    contractHours: 35,
    color: '#3B82F6',
  };

  const mockShift = {
    id: 'shift-1',
    clinicId,
    employeeId,
    date: new Date('2026-03-02'),
    startTime: '08:30',
    endTime: '17:00',
    shiftTypeCode: 'CHIR',
    breakMinutes: 60,
    isConfirmed: true,
    source: 'GENERATED',
  };

  const mockShift2 = {
    id: 'shift-2',
    clinicId,
    employeeId,
    date: new Date('2026-03-03'),
    startTime: '09:00',
    endTime: '18:00',
    shiftTypeCode: 'CONSUL',
    breakMinutes: 60,
    isConfirmed: false,
    source: 'MANUAL',
  };

  const mockUnavailabilityOneTime = {
    type: 'VACATION',
    startDate: new Date('2026-03-10'),
    endDate: new Date('2026-03-12'),
    reason: 'Annual leave',
    daysOfWeek: [],
  };

  const mockUnavailabilityRecurring = {
    type: 'SCHOOL',
    startDate: new Date('2026-03-01'),
    endDate: new Date('2026-03-31'),
    reason: null,
    daysOfWeek: [3], // Wednesday (ISO day)
  };

  const mockShiftTypes = [
    { code: 'CHIR', name: 'Chirurgie', color: '#FF0000', clinicId, breakMinutes: 60 },
    { code: 'CONSUL', name: 'Consultation', color: '#00FF00', clinicId, breakMinutes: 30 },
  ];

  const mockPrisma = {
    employee: { findUniqueOrThrow: jest.fn() },
    shift: { findMany: jest.fn() },
    unavailability: { findMany: jest.fn() },
    planningPeriodStatus: { findUnique: jest.fn() },
    clinicShiftType: { findMany: jest.fn() },
  };

  beforeEach(() => {
    service = new EmployeeScheduleService(mockPrisma as any);
    jest.clearAllMocks();
  });

  // ── getEmployeeSchedule ───────────────────────────────────────────

  describe('getEmployeeSchedule', () => {
    function setupDefaultMocks(): void {
      mockPrisma.employee.findUniqueOrThrow.mockResolvedValue(mockEmployee);
      mockPrisma.shift.findMany.mockResolvedValue([mockShift]);
      mockPrisma.unavailability.findMany.mockResolvedValue([]);
      mockPrisma.planningPeriodStatus.findUnique.mockResolvedValue(null);
      mockPrisma.clinicShiftType.findMany.mockResolvedValue(mockShiftTypes);
    }

    it('should return employee schedule data with correct month', async () => {
      setupDefaultMocks();

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(result.month).toBe('2026-03');
      expect(result.employee).toEqual(mockEmployee);
      expect(result.shifts).toHaveLength(1);
      expect(result.shiftTypes).toHaveLength(2);
    });

    it('should default to current month when month is not provided', async () => {
      setupDefaultMocks();

      const now = new Date();
      const expectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const result = await service.getEmployeeSchedule(clinicId, employeeId);

      expect(result.month).toBe(expectedMonth);
    });

    it('should throw BadRequestException for invalid month format', async () => {
      await expect(
        service.getEmployeeSchedule(clinicId, employeeId, '2026-13'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getEmployeeSchedule(clinicId, employeeId, 'not-a-month'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getEmployeeSchedule(clinicId, employeeId, '2026-00'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.getEmployeeSchedule(clinicId, employeeId, '2026-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should map shift dates from Date to YYYY-MM-DD strings', async () => {
      setupDefaultMocks();

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(result.shifts[0].date).toBe('2026-03-02');
      expect(typeof result.shifts[0].date).toBe('string');
    });

    it('should return all mapped shift fields correctly', async () => {
      setupDefaultMocks();

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');
      const shift = result.shifts[0];

      expect(shift).toEqual({
        id: 'shift-1',
        date: '2026-03-02',
        startTime: '08:30',
        endTime: '17:00',
        shiftTypeCode: 'CHIR',
        breakMinutes: 60,
        isConfirmed: true,
        source: 'GENERATED',
      });
    });

    it('should return DRAFT status when no PlanningPeriodStatus exists', async () => {
      setupDefaultMocks();
      mockPrisma.planningPeriodStatus.findUnique.mockResolvedValue(null);

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(result.publicationStatus.status).toBe('DRAFT');
      expect(result.publicationStatus.publishedAt).toBeNull();
    });

    it('should return PUBLISHED status when PlanningPeriodStatus exists', async () => {
      setupDefaultMocks();
      const publishedAt = new Date('2026-02-28T14:00:00Z');
      mockPrisma.planningPeriodStatus.findUnique.mockResolvedValue({
        status: 'PUBLISHED',
        publishedAt,
      });

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(result.publicationStatus.status).toBe('PUBLISHED');
      expect(result.publicationStatus.publishedAt).toBe(publishedAt.toISOString());
    });

    it('should propagate planningPeriodStatus.findUnique DB errors', async () => {
      setupDefaultMocks();
      mockPrisma.planningPeriodStatus.findUnique.mockRejectedValue(
        new Error('DB connection error'),
      );

      await expect(
        service.getEmployeeSchedule(clinicId, employeeId, '2026-03'),
      ).rejects.toThrow('DB connection error');
    });

    it('should expand one-time unavailabilities correctly', async () => {
      setupDefaultMocks();
      mockPrisma.unavailability.findMany.mockResolvedValue([mockUnavailabilityOneTime]);

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(result.unavailabilities).toHaveLength(3);
      expect(result.unavailabilities).toEqual([
        { date: '2026-03-10', type: 'VACATION', reason: 'Annual leave' },
        { date: '2026-03-11', type: 'VACATION', reason: 'Annual leave' },
        { date: '2026-03-12', type: 'VACATION', reason: 'Annual leave' },
      ]);
    });

    it('should expand recurring unavailabilities with daysOfWeek filter', async () => {
      setupDefaultMocks();
      mockPrisma.unavailability.findMany.mockResolvedValue([mockUnavailabilityRecurring]);

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      // March 2026: Wednesdays are 4, 11, 18, 25
      const wednesdays = result.unavailabilities.filter(
        (u) => u.type === 'SCHOOL',
      );
      expect(wednesdays).toHaveLength(4);
      expect(wednesdays.map((u) => u.date)).toEqual([
        '2026-03-04',
        '2026-03-11',
        '2026-03-18',
        '2026-03-25',
      ]);
    });

    it('should set reason to undefined when unavailability reason is null', async () => {
      setupDefaultMocks();
      mockPrisma.unavailability.findMany.mockResolvedValue([mockUnavailabilityRecurring]);

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      for (const ua of result.unavailabilities) {
        expect(ua.reason).toBeUndefined();
      }
    });

    it('should clamp unavailability range to month boundaries', async () => {
      setupDefaultMocks();
      const crossMonthUnavailability = {
        type: 'VACATION',
        startDate: new Date('2026-02-25'),
        endDate: new Date('2026-04-05'),
        reason: 'Extended leave',
        daysOfWeek: [],
      };
      mockPrisma.unavailability.findMany.mockResolvedValue([crossMonthUnavailability]);

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      // Should be clamped to March 1-31
      expect(result.unavailabilities[0].date).toBe('2026-03-01');
      expect(result.unavailabilities[result.unavailabilities.length - 1].date).toBe('2026-03-31');
      expect(result.unavailabilities).toHaveLength(31);
    });

    it('should compute weekly summary correctly', async () => {
      setupDefaultMocks();
      // Both shifts are in ISO week 10 of 2026 (Mon March 2 and Tue March 3)
      mockPrisma.shift.findMany.mockResolvedValue([mockShift, mockShift2]);

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(result.weeklySummary).toHaveLength(1);
      const week = result.weeklySummary[0];
      // shift-1: 17:00 - 08:30 = 510 min, shift-2: 18:00 - 09:00 = 540 min
      expect(week.totalMinutes).toBe(510 + 540);
      expect(week.shiftCount).toBe(2);
      expect(week.contractMinutes).toBe(35 * 60);
    });

    it('should sort weekly summary by week number', async () => {
      setupDefaultMocks();
      // Week 14 shift (March 30, 2026 is Monday of week 14)
      const lateShift = {
        ...mockShift,
        id: 'shift-late',
        date: new Date('2026-03-30'),
      };
      // Week 10 shift (March 2, 2026 is Monday of week 10)
      mockPrisma.shift.findMany.mockResolvedValue([lateShift, mockShift]);

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(result.weeklySummary.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < result.weeklySummary.length; i++) {
        expect(result.weeklySummary[i].weekNumber).toBeGreaterThan(
          result.weeklySummary[i - 1].weekNumber,
        );
      }
    });

    it('should map ClinicShiftType.name to label', async () => {
      setupDefaultMocks();

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(result.shiftTypes[0]).toEqual({
        code: 'CHIR',
        label: 'Chirurgie',
        color: '#FF0000',
        breakMinutes: 60,
      });
      expect(result.shiftTypes[1]).toEqual({
        code: 'CONSUL',
        label: 'Consultation',
        color: '#00FF00',
        breakMinutes: 30,
      });
    });

    it('should query shifts with correct date range', async () => {
      setupDefaultMocks();

      await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      const shiftCall = mockPrisma.shift.findMany.mock.calls[0][0];
      expect(shiftCall.where.date.gte).toEqual(new Date(Date.UTC(2026, 2, 1)));
      expect(shiftCall.where.date.lte).toEqual(new Date(Date.UTC(2026, 3, 0, 23, 59, 59, 999)));
    });

    it('should query employee with clinicId and employeeId', async () => {
      setupDefaultMocks();

      await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(mockPrisma.employee.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: employeeId, clinicId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobType: true,
          contractHours: true,
          color: true,
        },
      });
    });

    it('should return empty shifts and unavailabilities when none exist', async () => {
      setupDefaultMocks();
      mockPrisma.shift.findMany.mockResolvedValue([]);
      mockPrisma.unavailability.findMany.mockResolvedValue([]);

      const result = await service.getEmployeeSchedule(clinicId, employeeId, '2026-03');

      expect(result.shifts).toEqual([]);
      expect(result.unavailabilities).toEqual([]);
      expect(result.weeklySummary).toEqual([]);
    });
  });

  // ── getEmployeeShiftTypes ─────────────────────────────────────────

  describe('getEmployeeShiftTypes', () => {
    it('should return shift types with name mapped to label', async () => {
      mockPrisma.clinicShiftType.findMany.mockResolvedValue(mockShiftTypes);

      const result = await service.getEmployeeShiftTypes(clinicId);

      expect(result).toEqual([
        { code: 'CHIR', label: 'Chirurgie', color: '#FF0000', breakMinutes: 60 },
        { code: 'CONSUL', label: 'Consultation', color: '#00FF00', breakMinutes: 30 },
      ]);
      expect(mockPrisma.clinicShiftType.findMany).toHaveBeenCalledWith({
        where: { clinicId },
      });
    });

    it('should return empty array when no shift types exist', async () => {
      mockPrisma.clinicShiftType.findMany.mockResolvedValue([]);

      const result = await service.getEmployeeShiftTypes(clinicId);

      expect(result).toEqual([]);
    });
  });
});
