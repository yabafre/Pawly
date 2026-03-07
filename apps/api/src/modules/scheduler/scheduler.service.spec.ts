import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '@/prisma/prisma.service';
import { EmployeeService } from '@/modules/employee/employee.service';
import { MailService } from '@/modules/mail/mail.service';

describe('SchedulerService', () => {
  let service: SchedulerService;
  const savedTriggerKey = process.env.TRIGGER_SECRET_KEY;

  beforeAll(() => { delete process.env.TRIGGER_SECRET_KEY; });
  afterAll(() => { if (savedTriggerKey !== undefined) process.env.TRIGGER_SECRET_KEY = savedTriggerKey; });

  const mockPrismaService = {
    subscription: {
      findMany: jest.fn(),
    },
  };

  const mockEmployeeService = {
    listAllUndeclaredApprentices: jest.fn(),
  };

  const mockMailService = {
    sendSchoolDaysReminder: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmployeeService, useValue: mockEmployeeService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
    jest.clearAllMocks();
  });

  describe('handleSchoolDaysReminder', () => {
    it('fetches active subscriptions and sends reminders to undeclared apprentices', async () => {
      mockPrismaService.subscription.findMany.mockResolvedValue([
        { clinicId: 'clinic-1' },
      ]);
      mockEmployeeService.listAllUndeclaredApprentices.mockResolvedValue([
        {
          id: 'a-1',
          firstName: 'Léa',
          lastName: 'Bernard',
          email: 'lea@clinic.fr',
          clinicId: 'clinic-1',
        },
      ]);

      await service.handleSchoolDaysReminder();

      expect(mockPrismaService.subscription.findMany).toHaveBeenCalledWith({
        where: { status: { in: ['active', 'trialing'] } },
        select: { clinicId: true },
      });
      expect(mockEmployeeService.listAllUndeclaredApprentices).toHaveBeenCalledWith(
        ['clinic-1'],
        expect.stringMatching(/^\d{4}-\d{2}$/),
      );
      expect(mockMailService.sendSchoolDaysReminder).toHaveBeenCalledWith(
        'lea@clinic.fr',
        'Léa Bernard',
        expect.stringMatching(/^\d{4}-\d{2}$/),
      );
    });

    it('skips apprentices without email', async () => {
      mockPrismaService.subscription.findMany.mockResolvedValue([
        { clinicId: 'clinic-1' },
      ]);
      mockEmployeeService.listAllUndeclaredApprentices.mockResolvedValue([
        {
          id: 'a-1',
          firstName: 'Léa',
          lastName: 'Bernard',
          email: null,
          clinicId: 'clinic-1',
        },
      ]);

      await service.handleSchoolDaysReminder();

      expect(mockMailService.sendSchoolDaysReminder).not.toHaveBeenCalled();
    });

    it('processes apprentices from multiple clinics in a single batch', async () => {
      mockPrismaService.subscription.findMany.mockResolvedValue([
        { clinicId: 'clinic-1' },
        { clinicId: 'clinic-2' },
      ]);
      mockEmployeeService.listAllUndeclaredApprentices.mockResolvedValue([
        { id: 'a-1', firstName: 'Léa', lastName: 'B', email: 'lea@a.fr', clinicId: 'clinic-1' },
        { id: 'a-2', firstName: 'Tom', lastName: 'M', email: 'tom@b.fr', clinicId: 'clinic-2' },
      ]);

      await service.handleSchoolDaysReminder();

      expect(mockEmployeeService.listAllUndeclaredApprentices).toHaveBeenCalledTimes(1);
      expect(mockEmployeeService.listAllUndeclaredApprentices).toHaveBeenCalledWith(
        ['clinic-1', 'clinic-2'],
        expect.stringMatching(/^\d{4}-\d{2}$/),
      );
      expect(mockMailService.sendSchoolDaysReminder).toHaveBeenCalledTimes(2);
    });

    it('continues sending emails when one fails', async () => {
      mockPrismaService.subscription.findMany.mockResolvedValue([
        { clinicId: 'clinic-1' },
      ]);
      mockEmployeeService.listAllUndeclaredApprentices.mockResolvedValue([
        { id: 'a-1', firstName: 'Léa', lastName: 'B', email: 'lea@a.fr', clinicId: 'clinic-1' },
        { id: 'a-2', firstName: 'Tom', lastName: 'M', email: 'tom@b.fr', clinicId: 'clinic-1' },
      ]);
      mockMailService.sendSchoolDaysReminder
        .mockRejectedValueOnce(new Error('Email error'))
        .mockResolvedValueOnce(undefined);

      await service.handleSchoolDaysReminder();

      expect(mockMailService.sendSchoolDaysReminder).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no active subscriptions exist', async () => {
      mockPrismaService.subscription.findMany.mockResolvedValue([]);

      await service.handleSchoolDaysReminder();

      expect(mockEmployeeService.listAllUndeclaredApprentices).not.toHaveBeenCalled();
      expect(mockMailService.sendSchoolDaysReminder).not.toHaveBeenCalled();
    });

    it('skips execution when CRON_ENABLED is false', async () => {
      process.env.CRON_ENABLED = 'false';

      await service.handleSchoolDaysReminder();

      expect(mockPrismaService.subscription.findMany).not.toHaveBeenCalled();

      delete process.env.CRON_ENABLED;
    });
  });
});
