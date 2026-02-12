import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { PrismaService } from '@/prisma/prisma.service';
import { EmployeeService } from '@/modules/employee/employee.service';
import { MailService } from '@/modules/mail/mail.service';

describe('SchedulerService', () => {
  let service: SchedulerService;

  const mockPrismaService = {
    subscription: {
      findMany: jest.fn(),
    },
  };

  const mockEmployeeService = {
    listUndeclaredApprentices: jest.fn(),
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
      mockEmployeeService.listUndeclaredApprentices.mockResolvedValue([
        {
          id: 'a-1',
          firstName: 'Léa',
          lastName: 'Bernard',
          email: 'lea@clinic.fr',
        },
      ]);

      await service.handleSchoolDaysReminder();

      expect(mockPrismaService.subscription.findMany).toHaveBeenCalledWith({
        where: { status: { in: ['active', 'trialing'] } },
        select: { clinicId: true },
      });
      expect(mockEmployeeService.listUndeclaredApprentices).toHaveBeenCalledWith(
        'clinic-1',
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
      mockEmployeeService.listUndeclaredApprentices.mockResolvedValue([
        {
          id: 'a-1',
          firstName: 'Léa',
          lastName: 'Bernard',
          email: null,
        },
      ]);

      await service.handleSchoolDaysReminder();

      expect(mockMailService.sendSchoolDaysReminder).not.toHaveBeenCalled();
    });

    it('processes multiple clinics independently', async () => {
      mockPrismaService.subscription.findMany.mockResolvedValue([
        { clinicId: 'clinic-1' },
        { clinicId: 'clinic-2' },
      ]);
      mockEmployeeService.listUndeclaredApprentices
        .mockResolvedValueOnce([
          { id: 'a-1', firstName: 'Léa', lastName: 'B', email: 'lea@a.fr' },
        ])
        .mockResolvedValueOnce([
          { id: 'a-2', firstName: 'Tom', lastName: 'M', email: 'tom@b.fr' },
        ]);

      await service.handleSchoolDaysReminder();

      expect(mockEmployeeService.listUndeclaredApprentices).toHaveBeenCalledTimes(2);
      expect(mockMailService.sendSchoolDaysReminder).toHaveBeenCalledTimes(2);
    });

    it('continues processing other clinics when one fails', async () => {
      mockPrismaService.subscription.findMany.mockResolvedValue([
        { clinicId: 'clinic-1' },
        { clinicId: 'clinic-2' },
      ]);
      mockEmployeeService.listUndeclaredApprentices
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce([
          { id: 'a-2', firstName: 'Tom', lastName: 'M', email: 'tom@b.fr' },
        ]);

      await service.handleSchoolDaysReminder();

      expect(mockMailService.sendSchoolDaysReminder).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendSchoolDaysReminder).toHaveBeenCalledWith(
        'tom@b.fr',
        'Tom M',
        expect.any(String),
      );
    });

    it('does nothing when no active subscriptions exist', async () => {
      mockPrismaService.subscription.findMany.mockResolvedValue([]);

      await service.handleSchoolDaysReminder();

      expect(mockEmployeeService.listUndeclaredApprentices).not.toHaveBeenCalled();
      expect(mockMailService.sendSchoolDaysReminder).not.toHaveBeenCalled();
    });
  });
});
