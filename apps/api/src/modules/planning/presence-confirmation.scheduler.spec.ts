import { Test, TestingModule } from '@nestjs/testing';
import { PresenceConfirmationScheduler } from './presence-confirmation.scheduler';
import { PresenceConfirmationService } from './presence-confirmation.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('PresenceConfirmationScheduler', () => {
  let scheduler: PresenceConfirmationScheduler;
  const savedTriggerKey = process.env.TRIGGER_SECRET_KEY;

  beforeAll(() => { delete process.env.TRIGGER_SECRET_KEY; });
  afterAll(() => { if (savedTriggerKey !== undefined) process.env.TRIGGER_SECRET_KEY = savedTriggerKey; });

  const mockPrismaService = {
    planningPeriodStatus: {
      findMany: jest.fn(),
    },
  };

  const mockPresenceService = {
    detectNoShows: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceConfirmationScheduler,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PresenceConfirmationService, useValue: mockPresenceService },
      ],
    }).compile();

    scheduler = module.get<PresenceConfirmationScheduler>(PresenceConfirmationScheduler);
    jest.clearAllMocks();
  });

  it('should call detectNoShows for each clinic with PUBLISHED period', async () => {
    mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
      { clinicId: 'clinic-a' },
      { clinicId: 'clinic-b' },
    ]);
    mockPresenceService.detectNoShows.mockResolvedValue(1);

    await scheduler.handleNoShowDetection();

    expect(mockPresenceService.detectNoShows).toHaveBeenCalledTimes(2);
    expect(mockPresenceService.detectNoShows).toHaveBeenCalledWith(
      'clinic-a',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(mockPresenceService.detectNoShows).toHaveBeenCalledWith(
      'clinic-b',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('should query PUBLISHED periods for yesterday month', async () => {
    mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);

    await scheduler.handleNoShowDetection();

    expect(mockPrismaService.planningPeriodStatus.findMany).toHaveBeenCalledWith({
      where: {
        month: expect.stringMatching(/^\d{4}-\d{2}$/),
        status: 'PUBLISHED',
      },
      select: { clinicId: true },
    });
  });

  it('should not throw when detectNoShows fails', async () => {
    mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([
      { clinicId: 'clinic-a' },
    ]);
    mockPresenceService.detectNoShows.mockRejectedValue(new Error('DB error'));

    // Should not throw — error is caught and logged
    await expect(scheduler.handleNoShowDetection()).resolves.toBeUndefined();
  });

  it('should handle empty clinics list', async () => {
    mockPrismaService.planningPeriodStatus.findMany.mockResolvedValue([]);

    await scheduler.handleNoShowDetection();

    expect(mockPresenceService.detectNoShows).not.toHaveBeenCalled();
  });

  it('should not throw when prisma query fails', async () => {
    mockPrismaService.planningPeriodStatus.findMany.mockRejectedValue(
      new Error('Connection failed'),
    );

    await expect(scheduler.handleNoShowDetection()).resolves.toBeUndefined();
  });
});
