import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';

describe('PlanningService', () => {
  let service: PlanningService;

  const clinicId = 'clinic-123';

  const mockRule = {
    id: 'rule-1',
    name: 'Min 2 vets for surgery',
    description: 'Ensure adequate staffing',
    ruleType: 'HARD',
    category: 'STAFFING_MINIMUM',
    isActive: true,
    config: { shiftTypeCode: 'SURGERY', minStaff: 2 },
    priority: 10,
    clinicId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    planningRule: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    shift: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockClinicService = {
    listShiftTypes: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClinicService, useValue: mockClinicService },
      ],
    }).compile();

    service = module.get<PlanningService>(PlanningService);
    jest.clearAllMocks();
  });

  // ─── createRule ─────────────────────────────────────────────────────────

  describe('createRule', () => {
    it('creates a STAFFING_MINIMUM rule after validating shift type', async () => {
      mockClinicService.listShiftTypes.mockResolvedValue([
        { id: 'st-1', code: 'SURGERY', clinicId, name: 'Surgery' },
      ]);
      mockPrismaService.planningRule.create.mockResolvedValue(mockRule);

      const input = {
        name: 'Min 2 vets for surgery',
        description: 'Ensure adequate staffing',
        ruleType: 'HARD' as const,
        category: 'STAFFING_MINIMUM' as const,
        isActive: true,
        priority: 10,
        config: { shiftTypeCode: 'SURGERY', minStaff: 2 },
      };

      const result = await service.createRule(clinicId, input);

      expect(result).toEqual(mockRule);
      expect(mockClinicService.listShiftTypes).toHaveBeenCalledWith(clinicId);
      expect(mockPrismaService.planningRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinicId,
          name: input.name,
          category: 'STAFFING_MINIMUM',
        }),
      });
    });

    it('creates a ROTATION_EQUITY rule without shift type validation', async () => {
      mockPrismaService.planningRule.create.mockResolvedValue({
        ...mockRule,
        category: 'ROTATION_EQUITY',
        config: { targetDay: 'saturday', maxPerPeriod: 2, trackingPeriod: 'monthly' },
      });

      const input = {
        name: 'Saturday rotation',
        ruleType: 'SOFT' as const,
        category: 'ROTATION_EQUITY' as const,
        isActive: true,
        priority: 5,
        config: { targetDay: 'saturday', maxPerPeriod: 2, trackingPeriod: 'monthly' },
      };

      await service.createRule(clinicId, input as any);

      expect(mockClinicService.listShiftTypes).not.toHaveBeenCalled();
      expect(mockPrismaService.planningRule.create).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid STAFFING_MINIMUM config', async () => {
      const input = {
        name: 'Bad rule',
        ruleType: 'HARD' as const,
        category: 'STAFFING_MINIMUM' as const,
        isActive: true,
        priority: 0,
        config: { shiftTypeCode: '', minStaff: 0 },
      };

      await expect(service.createRule(clinicId, input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when shift type code does not exist', async () => {
      mockClinicService.listShiftTypes.mockResolvedValue([]);

      const input = {
        name: 'Rule with bad shift type',
        ruleType: 'HARD' as const,
        category: 'STAFFING_MINIMUM' as const,
        isActive: true,
        priority: 0,
        config: { shiftTypeCode: 'NONEXISTENT', minStaff: 1 },
      };

      await expect(service.createRule(clinicId, input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a CONTRACT_COMPLIANCE rule', async () => {
      mockPrismaService.planningRule.create.mockResolvedValue({
        ...mockRule,
        category: 'CONTRACT_COMPLIANCE',
        config: { maxWeeklyHours: 35 },
      });

      const input = {
        name: 'Weekly hours limit',
        ruleType: 'SOFT' as const,
        category: 'CONTRACT_COMPLIANCE' as const,
        isActive: true,
        priority: 0,
        config: { maxWeeklyHours: 35 },
      };

      await service.createRule(clinicId, input);

      expect(mockPrismaService.planningRule.create).toHaveBeenCalled();
      expect(mockClinicService.listShiftTypes).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for CONTRACT_COMPLIANCE without any hour limit', async () => {
      const input = {
        name: 'Bad compliance rule',
        ruleType: 'SOFT' as const,
        category: 'CONTRACT_COMPLIANCE' as const,
        isActive: true,
        priority: 0,
        config: { overtimeThresholdPercent: 10 },
      };

      await expect(service.createRule(clinicId, input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a SKILL_REQUIREMENT rule with shift type validation', async () => {
      mockClinicService.listShiftTypes.mockResolvedValue([
        { id: 'st-2', code: 'SURGERY', clinicId, name: 'Surgery' },
      ]);
      mockPrismaService.planningRule.create.mockResolvedValue({
        ...mockRule,
        category: 'SKILL_REQUIREMENT',
      });

      const input = {
        name: 'Surgery needs vet',
        ruleType: 'HARD' as const,
        category: 'SKILL_REQUIREMENT' as const,
        isActive: true,
        priority: 0,
        config: { shiftTypeCode: 'SURGERY', requiredJobTypes: ['VET'] },
      };

      await service.createRule(clinicId, input);

      expect(mockClinicService.listShiftTypes).toHaveBeenCalledWith(clinicId);
    });

    it('throws BadRequestException for unknown category', async () => {
      const input = {
        name: 'Unknown',
        ruleType: 'HARD',
        category: 'UNKNOWN_CATEGORY',
        isActive: true,
        priority: 0,
        config: {},
      };

      await expect(service.createRule(clinicId, input as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── updateRule ─────────────────────────────────────────────────────────

  describe('updateRule', () => {
    it('updates a rule after verifying ownership', async () => {
      mockPrismaService.planningRule.findFirst.mockResolvedValue(mockRule);
      mockClinicService.listShiftTypes.mockResolvedValue([
        { id: 'st-1', code: 'SURGERY', clinicId, name: 'Surgery' },
      ]);
      mockPrismaService.planningRule.update.mockResolvedValue({
        ...mockRule,
        name: 'Updated name',
      });

      const input = {
        id: 'rule-1',
        name: 'Updated name',
        ruleType: 'HARD' as const,
        category: 'STAFFING_MINIMUM' as const,
        isActive: true,
        priority: 10,
        config: { shiftTypeCode: 'SURGERY', minStaff: 3 },
      };

      const result = await service.updateRule(clinicId, input);

      expect(result.name).toBe('Updated name');
      expect(mockPrismaService.planningRule.findFirst).toHaveBeenCalledWith({
        where: { id: 'rule-1', clinicId },
      });
    });

    it('throws NotFoundException when rule does not exist', async () => {
      mockPrismaService.planningRule.findFirst.mockResolvedValue(null);

      const input = {
        id: 'nonexistent',
        name: 'Test',
        ruleType: 'HARD' as const,
        category: 'STAFFING_MINIMUM' as const,
        isActive: true,
        priority: 0,
        config: { shiftTypeCode: 'SURGERY', minStaff: 1 },
      };

      await expect(service.updateRule(clinicId, input)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── deleteRule ─────────────────────────────────────────────────────────

  describe('deleteRule', () => {
    it('deletes a rule scoped to clinic using deleteMany', async () => {
      mockPrismaService.planningRule.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteRule(clinicId, 'rule-1');

      expect(result).toEqual({ id: 'rule-1' });
      expect(mockPrismaService.planningRule.deleteMany).toHaveBeenCalledWith({
        where: { id: 'rule-1', clinicId },
      });
    });

    it('throws NotFoundException for non-existent rule', async () => {
      mockPrismaService.planningRule.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.deleteRule(clinicId, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for rule belonging to another clinic', async () => {
      mockPrismaService.planningRule.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deleteRule('other-clinic', 'rule-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listRules ────────────────────────────────────────────────────────

  describe('listRules', () => {
    it('returns all rules for a clinic when no filters', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([mockRule]);

      const result = await service.listRules(clinicId);

      expect(result).toEqual([mockRule]);
      expect(mockPrismaService.planningRule.findMany).toHaveBeenCalledWith({
        where: { clinicId },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
    });

    it('applies category filter', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([]);

      await service.listRules(clinicId, { category: 'ROTATION_EQUITY' });

      expect(mockPrismaService.planningRule.findMany).toHaveBeenCalledWith({
        where: { clinicId, category: 'ROTATION_EQUITY' },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
    });

    it('applies ruleType filter', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([]);

      await service.listRules(clinicId, { ruleType: 'HARD' });

      expect(mockPrismaService.planningRule.findMany).toHaveBeenCalledWith({
        where: { clinicId, ruleType: 'HARD' },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
    });

    it('applies isActive filter', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([]);

      await service.listRules(clinicId, { isActive: true });

      expect(mockPrismaService.planningRule.findMany).toHaveBeenCalledWith({
        where: { clinicId, isActive: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
    });

    it('applies all filters simultaneously', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([]);

      await service.listRules(clinicId, {
        category: 'STAFFING_MINIMUM',
        ruleType: 'HARD',
        isActive: true,
      });

      expect(mockPrismaService.planningRule.findMany).toHaveBeenCalledWith({
        where: {
          clinicId,
          category: 'STAFFING_MINIMUM',
          ruleType: 'HARD',
          isActive: true,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
    });
  });

  // ─── getRuleById ──────────────────────────────────────────────────────

  describe('getRuleById', () => {
    it('returns rule when found', async () => {
      mockPrismaService.planningRule.findFirst.mockResolvedValue(mockRule);

      const result = await service.getRuleById(clinicId, 'rule-1');

      expect(result).toEqual(mockRule);
    });

    it('throws NotFoundException when not found', async () => {
      mockPrismaService.planningRule.findFirst.mockResolvedValue(null);

      await expect(service.getRuleById(clinicId, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── toggleRule ───────────────────────────────────────────────────────

  describe('toggleRule', () => {
    it('toggles a rule to inactive', async () => {
      mockPrismaService.planningRule.findFirst.mockResolvedValue(mockRule);
      mockPrismaService.planningRule.update.mockResolvedValue({
        ...mockRule,
        isActive: false,
      });

      const result = await service.toggleRule(clinicId, {
        id: 'rule-1',
        isActive: false,
      });

      expect(result.isActive).toBe(false);
      expect(mockPrismaService.planningRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for non-existent rule', async () => {
      mockPrismaService.planningRule.findFirst.mockResolvedValue(null);

      await expect(
        service.toggleRule(clinicId, { id: 'missing', isActive: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── validateShiftsAgainstRules ───────────────────────────────────────

  describe('validateShiftsAgainstRules', () => {
    it('returns violations structure with loaded rules and shifts', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        mockRule,
        { ...mockRule, id: 'rule-2', ruleType: 'SOFT', category: 'ROTATION_EQUITY', config: { targetDay: 'saturday', maxPerPeriod: 2 } },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);

      const result = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result).toHaveProperty('hardViolations');
      expect(result).toHaveProperty('softViolations');
      expect(mockPrismaService.planningRule.findMany).toHaveBeenCalledWith({
        where: { clinicId, isActive: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      expect(mockPrismaService.shift.findMany).toHaveBeenCalled();
    });

    it('returns empty violations when no active rules', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([]);
      mockPrismaService.shift.findMany.mockResolvedValue([]);

      const result = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result.hardViolations).toHaveLength(0);
      expect(result.softViolations).toHaveLength(0);
    });

    it('should detect STAFFING_MINIMUM violation when below minStaff', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          name: 'Min 2 vets',
          category: 'STAFFING_MINIMUM',
          ruleType: 'HARD',
          isActive: true,
          priority: 1,
          config: { shiftTypeCode: 'SURGERY', minStaff: 2 },
          clinicId,
          slug: 'min-2-vets',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          id: 's1',
          date: new Date('2026-03-02'),
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '12:00',
          employeeId: 'emp-1',
          employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
        },
      ]);

      const result = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result.hardViolations.length).toBeGreaterThan(0);
      expect(result.hardViolations[0].category).toBe('STAFFING_MINIMUM');
    });

    it('should detect SKILL_REQUIREMENT violation when missing job type', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        {
          id: 'rule-2',
          name: 'Need ASV',
          category: 'SKILL_REQUIREMENT',
          ruleType: 'HARD',
          isActive: true,
          priority: 1,
          config: { shiftTypeCode: 'RECEPTION', requiredJobTypes: ['ASV'] },
          clinicId,
          slug: 'need-asv',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          id: 's1',
          date: new Date('2026-03-02'),
          shiftTypeCode: 'RECEPTION',
          startTime: '08:00',
          endTime: '18:00',
          employeeId: 'emp-1',
          employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
        },
      ]);

      const result = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result.hardViolations.length).toBeGreaterThan(0);
      expect(result.hardViolations[0].category).toBe('SKILL_REQUIREMENT');
    });

    it('should detect ROTATION_EQUITY violation when exceeding max shifts', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        {
          id: 'rule-3',
          name: 'Max 1 Saturday',
          category: 'ROTATION_EQUITY',
          ruleType: 'SOFT',
          isActive: true,
          priority: 1,
          config: { targetDay: 'saturday', maxPerPeriod: 1 },
          clinicId,
          slug: 'max-1-saturday',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          id: 's1',
          date: new Date('2026-03-07'), // Saturday
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '12:00',
          employeeId: 'emp-1',
          employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
        },
        {
          id: 's2',
          date: new Date('2026-03-14'), // Saturday
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '12:00',
          employeeId: 'emp-1',
          employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
        },
      ]);

      const result = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result.softViolations.length).toBeGreaterThan(0);
      expect(result.softViolations[0].category).toBe('ROTATION_EQUITY');
    });

    it('should detect CONTRACT_COMPLIANCE violation when exceeding max hours', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        {
          id: 'rule-4',
          name: 'Max monthly hours',
          category: 'CONTRACT_COMPLIANCE',
          ruleType: 'SOFT',
          isActive: true,
          priority: 1,
          config: { maxMonthlyHours: 10 },
          clinicId,
          slug: 'max-monthly-hours',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          id: 's1',
          date: new Date('2026-03-02'),
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '18:00',
          employeeId: 'emp-1',
          employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
        },
        {
          id: 's2',
          date: new Date('2026-03-03'),
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '18:00',
          employeeId: 'emp-1',
          employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
        },
      ]);

      const result = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result.softViolations.length).toBeGreaterThan(0);
      expect(result.softViolations[0].category).toBe('CONTRACT_COMPLIANCE');
    });
  });
});
