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

  const mockEmployeeService = {
    getNotificationPreferences: jest.fn(),
    updateNotificationPreferences: jest.fn(),
  };

  const mockPushNotificationService = {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    getSubscription: jest.fn(),
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
      prisma: mockPrisma as any, redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false } as any,
      employeeScheduleService: mockEmployeeScheduleService as any,
      employeeService: mockEmployeeService as any,
      pushNotificationService: mockPushNotificationService as any,
    } as any);
  };

  const createUnauthenticatedCaller = () => {
    return createCaller({
      user: null,
      prisma: mockPrisma as any, redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false } as any,
      employeeScheduleService: mockEmployeeScheduleService as any,
      employeeService: mockEmployeeService as any,
      pushNotificationService: mockPushNotificationService as any,
    } as any);
  };

  const createUnsubscribedCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    return createCaller({
      user: staffUser,
      prisma: mockPrisma as any, redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false } as any,
      employeeScheduleService: mockEmployeeScheduleService as any,
      employeeService: mockEmployeeService as any,
      pushNotificationService: mockPushNotificationService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Router shape --------------------------------------------------------

  it('should export 7 procedures', () => {
    const procedures = Object.keys(employeeScheduleRouter._def.procedures);
    expect(procedures).toEqual(
      expect.arrayContaining([
        'getMySchedule',
        'getMyShiftTypes',
        'getMyNotificationPreferences',
        'updateMyNotificationPreferences',
        'subscribePush',
        'unsubscribePush',
        'getMyPushSubscription',
      ]),
    );
    expect(procedures).toHaveLength(7);
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

  // --- getMyNotificationPreferences -----------------------------------------

  describe('getMyNotificationPreferences', () => {
    it('should reject unauthenticated users', async () => {
      const caller = createUnauthenticatedCaller();
      await expect(caller.getMyNotificationPreferences()).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when user has no linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ employee: null });
      const caller = createSubscribedCaller();
      await expect(caller.getMyNotificationPreferences()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should return notification preferences for linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ employee: { id: 'emp-1' } });
      mockEmployeeService.getNotificationPreferences.mockResolvedValue({ notifyOnPublish: true });
      const caller = createSubscribedCaller();
      const result = await caller.getMyNotificationPreferences();
      expect(result).toEqual({ notifyOnPublish: true });
      expect(mockEmployeeService.getNotificationPreferences).toHaveBeenCalledWith('clinic-123', 'emp-1');
    });
  });

  // --- updateMyNotificationPreferences --------------------------------------

  describe('updateMyNotificationPreferences', () => {
    it('should reject unauthenticated users', async () => {
      const caller = createUnauthenticatedCaller();
      await expect(caller.updateMyNotificationPreferences({ notifyOnPublish: false })).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when user has no linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const caller = createSubscribedCaller();
      await expect(caller.updateMyNotificationPreferences({ notifyOnPublish: false })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should update notification preferences for linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ employee: { id: 'emp-1' } });
      mockEmployeeService.updateNotificationPreferences.mockResolvedValue({ notifyOnPublish: false });
      const caller = createSubscribedCaller();
      const result = await caller.updateMyNotificationPreferences({ notifyOnPublish: false });
      expect(result).toEqual({ notifyOnPublish: false });
      expect(mockEmployeeService.updateNotificationPreferences).toHaveBeenCalledWith(
        'clinic-123', 'emp-1', { notifyOnPublish: false },
      );
    });
  });

  // --- subscribePush --------------------------------------------------------

  describe('subscribePush', () => {
    const pushInput = {
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
    };

    it('should reject unauthenticated users', async () => {
      const caller = createUnauthenticatedCaller();
      await expect(caller.subscribePush(pushInput)).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when user has no linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const caller = createSubscribedCaller();
      await expect(caller.subscribePush(pushInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should subscribe push for linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ employee: { id: 'emp-1' } });
      mockPushNotificationService.subscribe.mockResolvedValue({ id: 'sub-1' });
      const caller = createSubscribedCaller();
      const result = await caller.subscribePush(pushInput);
      expect(result).toEqual({ success: true });
      expect(mockPushNotificationService.subscribe).toHaveBeenCalledWith(
        'emp-1', 'clinic-123', pushInput,
      );
    });
  });

  // --- unsubscribePush ------------------------------------------------------

  describe('unsubscribePush', () => {
    it('should reject unauthenticated users', async () => {
      const caller = createUnauthenticatedCaller();
      await expect(caller.unsubscribePush({ endpoint: 'https://push.example.com/sub1' })).rejects.toThrow(TRPCError);
    });

    it('should throw FORBIDDEN when user has no linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const caller = createSubscribedCaller();
      await expect(caller.unsubscribePush({ endpoint: 'https://push.example.com/sub1' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should unsubscribe push for linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ employee: { id: 'emp-1' } });
      mockPushNotificationService.unsubscribe.mockResolvedValue({ count: 1 });
      const caller = createSubscribedCaller();
      const result = await caller.unsubscribePush({ endpoint: 'https://push.example.com/sub1' });
      expect(result).toEqual({ success: true });
      expect(mockPushNotificationService.unsubscribe).toHaveBeenCalledWith(
        'https://push.example.com/sub1', 'emp-1',
      );
    });
  });

  // --- getMyPushSubscription ------------------------------------------------

  describe('getMyPushSubscription', () => {
    it('should reject unauthenticated users', async () => {
      const caller = createUnauthenticatedCaller();
      await expect(caller.getMyPushSubscription()).rejects.toThrow(TRPCError);
    });

    it('should return subscribed: true when subscription exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ employee: { id: 'emp-1' } });
      mockPushNotificationService.getSubscription.mockResolvedValue({
        endpoint: 'https://push.example.com/sub1',
        createdAt: new Date(),
      });
      const caller = createSubscribedCaller();
      const result = await caller.getMyPushSubscription();
      expect(result.subscribed).toBe(true);
    });

    it('should return subscribed: false when no subscription', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ employee: { id: 'emp-1' } });
      mockPushNotificationService.getSubscription.mockResolvedValue(null);
      const caller = createSubscribedCaller();
      const result = await caller.getMyPushSubscription();
      expect(result).toEqual({ subscribed: false });
    });
  });
});
