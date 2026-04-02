jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { TRPCError } from '@trpc/server';
import { dashboardRouter } from './dashboard.router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(dashboardRouter);

describe('dashboardRouter', () => {
  const mockDashboardService = {
    getStats: jest.fn(),
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

  const adminUser = {
    sub: 'user-admin-1',
    email: 'admin@clinic.fr',
    role: 'ADMIN',
    clinicId: 'clinic-123',
  };

  const staffUser = {
    sub: 'user-staff-1',
    email: 'staff@clinic.fr',
    role: 'STAFF',
    clinicId: 'clinic-123',
  };

  const createAdminCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: adminUser,
      prisma: mockPrisma as any, redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false } as any,
      dashboardService: mockDashboardService as any,
    } as any);
  };

  const createStaffCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: staffUser,
      prisma: mockPrisma as any, redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false } as any,
      dashboardService: mockDashboardService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should export 1 procedure (getStats)', () => {
    const procedures = Object.keys(dashboardRouter._def.procedures);
    expect(procedures).toEqual(['getStats']);
  });

  describe('getStats', () => {
    const mockStats = {
      activeEmployees: 12,
      jobTypeBreakdown: { VET: 5, ASV: 4, APPRENTICE: 3 },
      pendingRequests: 5,
      pendingAbsences: 3,
      pendingVariances: 2,
      monthlyPlannedHours: 320,
      totalShifts: 40,
      weekNumber: 9,
      undeclaredApprenticeCount: 1,
      monthLabel: '2026-02',
    };

    it('should return stats for admin', async () => {
      mockDashboardService.getStats.mockResolvedValue(mockStats);

      const caller = createAdminCaller();
      const result = await caller.getStats();

      expect(result).toEqual(mockStats);
      expect(mockDashboardService.getStats).toHaveBeenCalledWith('clinic-123');
    });

    it('should reject staff from viewing stats', async () => {
      const caller = createStaffCaller();

      await expect(caller.getStats()).rejects.toThrow(TRPCError);
    });

    it('should reject unauthenticated users', async () => {
      const caller = createCaller({
        user: null,
        prisma: mockPrisma as any, redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), incr: jest.fn().mockResolvedValue(1), isAvailable: false } as any,
        dashboardService: mockDashboardService as any,
      } as any);

      await expect(caller.getStats()).rejects.toThrow(TRPCError);
    });

    it('should delegate to dashboardService', async () => {
      mockDashboardService.getStats.mockResolvedValue(mockStats);

      const caller = createAdminCaller();
      await caller.getStats();

      expect(mockDashboardService.getStats).toHaveBeenCalledTimes(1);
      expect(mockDashboardService.getStats).toHaveBeenCalledWith('clinic-123');
    });
  });
});
