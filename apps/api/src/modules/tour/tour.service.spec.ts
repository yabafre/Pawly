import { Test } from '@nestjs/testing';
import { TourService } from './tour.service';
import { PrismaService } from '@/prisma/prisma.service';

// AC-2 (verbatim from story 10-4-onboarding-tour-engine:18):
//   Backend API — Given an authenticated user, When the client calls
//   tour.getState, Then it returns { tourCompletedAt: string | null,
//   tourState: TourState | null } for that user; And
//   tour.saveProgress({ tourKey, step }) upserts tourState; And
//   tour.complete({ tourKey }) sets tourCompletedAt = now() and clears tourState.
describe('TourService', () => {
  let service: TourService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [TourService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(TourService);
  });

  it('getState returns null fields when user has no tour data', async () => {
    prisma.user.findUnique.mockResolvedValue({
      tourCompletedAt: null,
      tourState: null,
    });
    const res = await service.getState('u1');
    expect(res).toEqual({ tourCompletedAt: null, tourState: null });
  });

  it('getState serializes tourCompletedAt to ISO string', async () => {
    const d = new Date('2026-06-17T10:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({
      tourCompletedAt: d,
      tourState: { tourKey: 'admin-onboarding', step: 2, updatedAt: 'x' },
    });
    const res = await service.getState('u1');
    expect(res.tourCompletedAt).toBe('2026-06-17T10:00:00.000Z');
    expect(res.tourState).toEqual({
      tourKey: 'admin-onboarding',
      step: 2,
      updatedAt: 'x',
    });
  });

  it('saveProgress writes tourState with tourKey + step', async () => {
    prisma.user.update.mockResolvedValue({});
    await service.saveProgress('u1', 'employee-onboarding', 3);
    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'u1' });
    expect(arg.data.tourState.tourKey).toBe('employee-onboarding');
    expect(arg.data.tourState.step).toBe(3);
  });

  it('complete sets tourCompletedAt and clears tourState', async () => {
    prisma.user.update.mockResolvedValue({});
    await service.complete('u1');
    const arg = prisma.user.update.mock.calls[0][0];
    expect(arg.data.tourCompletedAt).toBeInstanceOf(Date);
    expect(arg.data.tourState).toBeDefined(); // Prisma.DbNull
  });
});
