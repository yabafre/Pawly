import { Test, TestingModule } from '@nestjs/testing';
import { EquityCounterScheduler } from './equity-counter.scheduler';
import { EquityCounterService } from './equity-counter.service';

describe('EquityCounterScheduler', () => {
  let scheduler: EquityCounterScheduler;
  const savedTriggerKey = process.env.TRIGGER_SECRET_KEY;

  beforeAll(() => { delete process.env.TRIGGER_SECRET_KEY; });
  afterAll(() => { if (savedTriggerKey !== undefined) process.env.TRIGGER_SECRET_KEY = savedTriggerKey; });

  const mockEquityCounterService = {
    recalculateAllClinics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EquityCounterScheduler,
        {
          provide: EquityCounterService,
          useValue: mockEquityCounterService,
        },
      ],
    }).compile();

    scheduler = module.get<EquityCounterScheduler>(EquityCounterScheduler);
    jest.clearAllMocks();
  });

  // ─── handleNightlyRecalculation ─────────────────────────────────────────

  describe('handleNightlyRecalculation', () => {
    it('calls recalculateAllClinics with current year and month', async () => {
      mockEquityCounterService.recalculateAllClinics.mockResolvedValue(undefined);

      const now = new Date();
      const expectedYear = now.getFullYear();
      const expectedMonth = now.getMonth() + 1;

      await scheduler.handleNightlyRecalculation();

      expect(
        mockEquityCounterService.recalculateAllClinics,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockEquityCounterService.recalculateAllClinics,
      ).toHaveBeenCalledWith(expectedYear, expectedMonth);
    });

    it('catches and logs errors from recalculateAllClinics', async () => {
      mockEquityCounterService.recalculateAllClinics.mockRejectedValue(
        new Error('Critical failure'),
      );

      // Should not throw — errors are caught and logged
      await expect(
        scheduler.handleNightlyRecalculation(),
      ).resolves.toBeUndefined();
    });
  });

  // ─── handleMonthlyFinalization ──────────────────────────────────────────

  describe('handleMonthlyFinalization', () => {
    it('calls recalculateAllClinics with previous month', async () => {
      mockEquityCounterService.recalculateAllClinics.mockResolvedValue(undefined);

      const now = new Date();
      let expectedYear = now.getFullYear();
      let expectedMonth = now.getMonth(); // getMonth() is 0-based, so this is previous month 1-based

      if (expectedMonth === 0) {
        expectedMonth = 12;
        expectedYear -= 1;
      }

      await scheduler.handleMonthlyFinalization();

      expect(
        mockEquityCounterService.recalculateAllClinics,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockEquityCounterService.recalculateAllClinics,
      ).toHaveBeenCalledWith(expectedYear, expectedMonth);
    });

    it('handles January boundary correctly (previous month = December of previous year)', async () => {
      // We need to mock Date to simulate January
      const realDate = Date;
      const mockDate = new Date(2026, 0, 1, 3, 0, 0); // January 1, 2026

      jest.spyOn(global, 'Date').mockImplementation((...args: any[]) => {
        if (args.length === 0) {
          return mockDate;
        }
        return new realDate(...(args as [any]));
      });

      mockEquityCounterService.recalculateAllClinics.mockResolvedValue(undefined);

      await scheduler.handleMonthlyFinalization();

      expect(
        mockEquityCounterService.recalculateAllClinics,
      ).toHaveBeenCalledWith(2025, 12);

      jest.restoreAllMocks();
    });

    it('handles non-January months correctly (e.g., March -> February)', async () => {
      const realDate = Date;
      const mockDate = new Date(2026, 2, 1, 3, 0, 0); // March 1, 2026

      jest.spyOn(global, 'Date').mockImplementation((...args: any[]) => {
        if (args.length === 0) {
          return mockDate;
        }
        return new realDate(...(args as [any]));
      });

      mockEquityCounterService.recalculateAllClinics.mockResolvedValue(undefined);

      await scheduler.handleMonthlyFinalization();

      expect(
        mockEquityCounterService.recalculateAllClinics,
      ).toHaveBeenCalledWith(2026, 2);

      jest.restoreAllMocks();
    });

    it('catches and logs errors from recalculateAllClinics', async () => {
      mockEquityCounterService.recalculateAllClinics.mockRejectedValue(
        new Error('DB timeout'),
      );

      // Should not throw — errors are caught and logged
      await expect(
        scheduler.handleMonthlyFinalization(),
      ).resolves.toBeUndefined();
    });
  });
});
