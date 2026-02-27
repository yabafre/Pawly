jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { TRPCError } from '@trpc/server';
import { employeeScheduleRouter } from './employee-schedule.router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(employeeScheduleRouter);

describe('employeeScheduleRouter', () => {
  const mockEmployeeScheduleService = {
    getEmployeeSchedule: jest.fn(),
    getEmployeeShiftTypes: jest.fn(),
  };

  const mockPrisma = {
    subscription: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const activeSubscription = {
    status: 'active',
    entitlementTier: 'starter',
    currentPeriodEnd: new Date('2026-12-31'),
    cancelAtPeriodEnd: false,
  };

  const staffUser = {
    sub: 'user-staff-1',
    email: 'staff@clinic.fr',
    role: 'STAFF',
    clinicId: 'clinic-123',
  };

  const createSubscribedCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: staffUser,
      prisma: mockPrisma as any,
      employeeScheduleService: mockEmployeeScheduleService as any,
    } as any);
  };

  const createUnauthenticatedCaller = () => {
    return createCaller({
      user: null,
      prisma: mockPrisma as any,
      employeeScheduleService: mockEmployeeScheduleService as any,
    } as any);
  };

  const createUnsubscribedCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    return createCaller({
      user: staffUser,
      prisma: mockPrisma as any,
      employeeScheduleService: mockEmployeeScheduleService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Router shape --------------------------------------------------------

  it('should export 2 procedures (getMySchedule, getMyShiftTypes)', () => {
    const procedures = Object.keys(employeeScheduleRouter._def.procedures);
    expect(procedures).toEqual(
      expect.arrayContaining(['getMySchedule', 'getMyShiftTypes']),
    );
    expect(procedures).toHaveLength(2);
  });

  // --- getMySchedule -------------------------------------------------------

  describe('getMySchedule', () => {
    const mockScheduleData = {
      month: '2026-02',
      employee: {
        id: 'emp-1',
        firstName: 'Marie',
        lastName: 'Dupont',
        jobType: 'ASV',
        contractHours: 35,
        color: '#4A90D9',
      },
      shifts: [],
      unavailabilities: [],
      publicationStatus: { status: 'PUBLISHED', publishedAt: '2026-02-01T10:00:00Z' },
      weeklySummary: [],
      shiftTypes: [],
    };

    it('should reject unauthenticated users', async () => {
      const caller = createUnauthenticatedCaller();

      await expect(caller.getMySchedule({})).rejects.toThrow(TRPCError);
      await expect(caller.getMySchedule({})).rejects.toThrow('You must be logged in');
    });

    it('should reject users without active subscription', async () => {
      const caller = createUnsubscribedCaller();

      await expect(caller.getMySchedule({})).rejects.toThrow(TRPCError);
      await expect(caller.getMySchedule({})).rejects.toThrow('Active subscription required');
    });

    it('should throw FORBIDDEN when user has no linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ employee: null });

      const caller = createSubscribedCaller();

      await expect(caller.getMySchedule({})).rejects.toThrow(TRPCError);
      await expect(caller.getMySchedule({})).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'No linked employee account',
      });
    });

    it('should throw FORBIDDEN when user record is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const caller = createSubscribedCaller();

      await expect(caller.getMySchedule({})).rejects.toThrow(TRPCError);
      await expect(caller.getMySchedule({})).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'No linked employee account',
      });
    });

    it('should resolve employeeId from DB and call service with correct args', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        employee: { id: 'emp-1' },
      });
      mockEmployeeScheduleService.getEmployeeSchedule.mockResolvedValue(mockScheduleData);

      const caller = createSubscribedCaller();
      const result = await caller.getMySchedule({ month: '2026-02' });

      expect(result).toEqual(mockScheduleData);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-staff-1' },
        select: { employee: { select: { id: true } } },
      });
      expect(mockEmployeeScheduleService.getEmployeeSchedule).toHaveBeenCalledWith(
        'clinic-123',
        'emp-1',
        '2026-02',
      );
    });

    it('should pass undefined month when not provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        employee: { id: 'emp-1' },
      });
      mockEmployeeScheduleService.getEmployeeSchedule.mockResolvedValue(mockScheduleData);

      const caller = createSubscribedCaller();
      await caller.getMySchedule({});

      expect(mockEmployeeScheduleService.getEmployeeSchedule).toHaveBeenCalledWith(
        'clinic-123',
        'emp-1',
        undefined,
      );
    });

    it('should call service exactly once per request', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        employee: { id: 'emp-1' },
      });
      mockEmployeeScheduleService.getEmployeeSchedule.mockResolvedValue(mockScheduleData);

      const caller = createSubscribedCaller();
      await caller.getMySchedule({ month: '2026-03' });

      expect(mockEmployeeScheduleService.getEmployeeSchedule).toHaveBeenCalledTimes(1);
    });
  });

  // --- getMyShiftTypes -----------------------------------------------------

  describe('getMyShiftTypes', () => {
    const mockShiftTypes = [
      { code: 'MATIN', label: 'Matin', color: '#4A90D9', breakMinutes: 30 },
      { code: 'SOIR', label: 'Soir', color: '#D94A4A', breakMinutes: 20 },
    ];

    it('should reject unauthenticated users', async () => {
      const caller = createUnauthenticatedCaller();

      await expect(caller.getMyShiftTypes()).rejects.toThrow(TRPCError);
      await expect(caller.getMyShiftTypes()).rejects.toThrow('You must be logged in');
    });

    it('should reject users without active subscription', async () => {
      const caller = createUnsubscribedCaller();

      await expect(caller.getMyShiftTypes()).rejects.toThrow(TRPCError);
      await expect(caller.getMyShiftTypes()).rejects.toThrow('Active subscription required');
    });

    it('should return shift types for subscribed user', async () => {
      mockEmployeeScheduleService.getEmployeeShiftTypes.mockResolvedValue(mockShiftTypes);

      const caller = createSubscribedCaller();
      const result = await caller.getMyShiftTypes();

      expect(result).toEqual(mockShiftTypes);
      expect(mockEmployeeScheduleService.getEmployeeShiftTypes).toHaveBeenCalledWith('clinic-123');
    });

    it('should call service exactly once per request', async () => {
      mockEmployeeScheduleService.getEmployeeShiftTypes.mockResolvedValue(mockShiftTypes);

      const caller = createSubscribedCaller();
      await caller.getMyShiftTypes();

      expect(mockEmployeeScheduleService.getEmployeeShiftTypes).toHaveBeenCalledTimes(1);
    });
  });
});
