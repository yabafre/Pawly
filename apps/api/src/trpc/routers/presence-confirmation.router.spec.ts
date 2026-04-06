jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { TRPCError } from '@trpc/server';
import { presenceConfirmationRouter } from './presence-confirmation.router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(presenceConfirmationRouter);

describe('presenceConfirmationRouter', () => {
  const mockPresenceConfirmationService = {
    confirmPresence: jest.fn(),
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

  const validInput = {
    shiftId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  };

  const mockConfirmResult = {
    shiftId: validInput.shiftId,
    isConfirmed: true,
    deltaMinutes: 0,
    varianceType: 'CLOCK_IN_DEVIATION' as const,
  };

  const createSubscribedCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: staffUser,
      prisma: mockPrisma as any, redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false } as any,
      presenceConfirmationService: mockPresenceConfirmationService as any,
    } as any);
  };

  const createUnauthenticatedCaller = () => {
    return createCaller({
      user: null,
      prisma: mockPrisma as any, redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false } as any,
      presenceConfirmationService: mockPresenceConfirmationService as any,
    } as any);
  };

  const createUnsubscribedCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(null);
    return createCaller({
      user: staffUser,
      prisma: mockPrisma as any, redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false } as any,
      presenceConfirmationService: mockPresenceConfirmationService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should export 1 procedure (confirmMyShift)', () => {
    const procedures = Object.keys(presenceConfirmationRouter._def.procedures);
    expect(procedures).toEqual(['confirmMyShift']);
    expect(procedures).toHaveLength(1);
  });

  describe('confirmMyShift', () => {
    it('should reject unauthenticated users', async () => {
      const caller = createUnauthenticatedCaller();

      await expect(caller.confirmMyShift(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.confirmMyShift(validInput)).rejects.toThrow('You must be logged in');
    });

    it('should reject users without active subscription', async () => {
      const caller = createUnsubscribedCaller();

      await expect(caller.confirmMyShift(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.confirmMyShift(validInput)).rejects.toThrow('Active subscription required');
    });

    it('should throw FORBIDDEN when user has no linked employee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ employee: null });

      const caller = createSubscribedCaller();

      await expect(caller.confirmMyShift(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.confirmMyShift(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'No linked employee account',
      });
    });

    it('should throw FORBIDDEN when user record is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const caller = createSubscribedCaller();

      await expect(caller.confirmMyShift(validInput)).rejects.toThrow(TRPCError);
      await expect(caller.confirmMyShift(validInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('should resolve employeeId from DB and call service with correct args', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        employee: { id: 'emp-1' },
      });
      mockPresenceConfirmationService.confirmPresence.mockResolvedValue(mockConfirmResult);

      const caller = createSubscribedCaller();
      const result = await caller.confirmMyShift(validInput);

      expect(result).toEqual(mockConfirmResult);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-staff-1' },
        select: { employee: { select: { id: true } } },
      });
      expect(mockPresenceConfirmationService.confirmPresence).toHaveBeenCalledWith(
        'clinic-123',
        'emp-1',
        validInput.shiftId,
        undefined,
      );
    });

    it('should pass actualStartTime when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        employee: { id: 'emp-1' },
      });
      mockPresenceConfirmationService.confirmPresence.mockResolvedValue(mockConfirmResult);

      const caller = createSubscribedCaller();
      const inputWithTime = {
        ...validInput,
        actualStartTime: '2026-02-28T08:30:00.000Z',
      };
      await caller.confirmMyShift(inputWithTime);

      expect(mockPresenceConfirmationService.confirmPresence).toHaveBeenCalledWith(
        'clinic-123',
        'emp-1',
        validInput.shiftId,
        '2026-02-28T08:30:00.000Z',
      );
    });

    it('should call service exactly once per request', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        employee: { id: 'emp-1' },
      });
      mockPresenceConfirmationService.confirmPresence.mockResolvedValue(mockConfirmResult);

      const caller = createSubscribedCaller();
      await caller.confirmMyShift(validInput);

      expect(mockPresenceConfirmationService.confirmPresence).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid shiftId format', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        employee: { id: 'emp-1' },
      });

      const caller = createSubscribedCaller();

      await expect(
        caller.confirmMyShift({ shiftId: 'not-a-uuid' }),
      ).rejects.toThrow();
    });

    it('should use clinicId from authenticated context (not from input)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        employee: { id: 'emp-1' },
      });
      mockPresenceConfirmationService.confirmPresence.mockResolvedValue(mockConfirmResult);

      const caller = createSubscribedCaller();
      await caller.confirmMyShift(validInput);

      const call = mockPresenceConfirmationService.confirmPresence.mock.calls[0];
      expect(call[0]).toBe('clinic-123'); // From ctx.user.clinicId
    });
  });
});
