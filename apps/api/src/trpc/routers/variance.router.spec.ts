jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json ?? v,
  },
}));

import { TRPCError } from '@trpc/server';
import { varianceRouter } from './variance.router';
import { createCallerFactory } from '../trpc';

const createCaller = createCallerFactory(varianceRouter);

describe('varianceRouter', () => {
  const mockVarianceService = {
    listVarianceEvents: jest.fn(),
    reviewVariance: jest.fn(),
    getVarianceStats: jest.fn(),
    countPendingVarianceEvents: jest.fn(),
    exportVarianceCsv: jest.fn(),
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
      prisma: mockPrisma as any,
      varianceService: mockVarianceService as any,
    } as any);
  };

  const createStaffCaller = () => {
    mockPrisma.subscription.findUnique.mockResolvedValue(activeSubscription);
    return createCaller({
      user: staffUser,
      prisma: mockPrisma as any,
      varianceService: mockVarianceService as any,
    } as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Router shape ───────────────────────────────────────────────────

  it('should export all 5 procedures', () => {
    const procedures = Object.keys(varianceRouter._def.procedures);
    expect(procedures).toEqual(
      expect.arrayContaining(['list', 'review', 'getStats', 'countPending', 'exportCsv']),
    );
    expect(procedures).toHaveLength(5);
  });

  // ─── list ───────────────────────────────────────────────────────────

  describe('list', () => {
    it('should list variance events for authenticated user', async () => {
      const events = { items: [{ id: 'v1' }], total: 1 };
      mockVarianceService.listVarianceEvents.mockResolvedValue(events);

      const caller = createAdminCaller();
      const result = await caller.list({ status: 'PENDING' });

      expect(result).toEqual(events);
      expect(mockVarianceService.listVarianceEvents).toHaveBeenCalledWith(
        'clinic-123',
        { status: 'PENDING', page: 0, pageSize: 10 },
      );
    });

    it('should reject staff from listing variance events', async () => {
      const caller = createStaffCaller();

      await expect(caller.list({})).rejects.toThrow(TRPCError);
    });

    it('should reject unauthenticated users', async () => {
      const caller = createCaller({
        user: null,
        prisma: mockPrisma as any,
        varianceService: mockVarianceService as any,
      } as any);

      await expect(caller.list({})).rejects.toThrow(TRPCError);
    });
  });

  // ─── review ─────────────────────────────────────────────────────────

  describe('review', () => {
    it('should allow admin to approve variance', async () => {
      const approved = { id: 'v1', status: 'APPROVED' };
      mockVarianceService.reviewVariance.mockResolvedValue(approved);

      const caller = createAdminCaller();
      const result = await caller.review({
        varianceId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'approve',
      });

      expect(result.status).toBe('APPROVED');
    });

    it('should allow admin to reject with exception note', async () => {
      const rejected = { id: 'v1', status: 'REJECTED', exceptionNote: 'Not valid' };
      mockVarianceService.reviewVariance.mockResolvedValue(rejected);

      const caller = createAdminCaller();
      const result = await caller.review({
        varianceId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'reject',
        exceptionNote: 'Not valid',
      });

      expect(result.status).toBe('REJECTED');
    });

    it('should reject staff from reviewing', async () => {
      const caller = createStaffCaller();

      await expect(
        caller.review({
          varianceId: '550e8400-e29b-41d4-a716-446655440000',
          action: 'approve',
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  // ─── getStats ───────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return stats for authenticated user', async () => {
      const stats = { countByType: [], countByStatus: [], totals: {} };
      mockVarianceService.getVarianceStats.mockResolvedValue(stats);

      const caller = createAdminCaller();
      const result = await caller.getStats({ month: '2026-02' });

      expect(result).toEqual(stats);
    });

    it('should reject staff from viewing stats', async () => {
      const caller = createStaffCaller();

      await expect(caller.getStats({})).rejects.toThrow(TRPCError);
    });
  });

  // ─── countPending ───────────────────────────────────────────────────

  describe('countPending', () => {
    it('should return pending count for admin', async () => {
      mockVarianceService.countPendingVarianceEvents.mockResolvedValue(5);

      const caller = createAdminCaller();
      const result = await caller.countPending();

      expect(result).toBe(5);
    });

    it('should reject staff from counting pending', async () => {
      const caller = createStaffCaller();

      await expect(caller.countPending()).rejects.toThrow(TRPCError);
    });
  });

  // ─── exportCsv ──────────────────────────────────────────────────────

  describe('exportCsv', () => {
    it('should return CSV string for admin', async () => {
      mockVarianceService.exportVarianceCsv.mockResolvedValue('header\nrow1');

      const caller = createAdminCaller();
      const result = await caller.exportCsv({ month: '2026-02' });

      expect(result).toBe('header\nrow1');
    });

    it('should reject staff from exporting', async () => {
      const caller = createStaffCaller();

      await expect(
        caller.exportCsv({ month: '2026-02' }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
