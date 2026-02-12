import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { PrismaService } from '@/prisma/prisma.service';

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
    clinicShiftType: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PlanningService>(PlanningService);
    jest.clearAllMocks();
  });

  // ─── createRule ─────────────────────────────────────────────────────────

  describe('createRule', () => {
    it('creates a STAFFING_MINIMUM rule after validating shift type', async () => {
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-1',
        code: 'SURGERY',
        clinicId,
      });
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
      expect(mockPrismaService.clinicShiftType.findFirst).toHaveBeenCalledWith({
        where: { clinicId, code: 'SURGERY' },
      });
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

      await service.createRule(clinicId, input);

      expect(mockPrismaService.clinicShiftType.findFirst).not.toHaveBeenCalled();
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
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue(null);

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
      expect(mockPrismaService.clinicShiftType.findFirst).not.toHaveBeenCalled();
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
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-2',
        code: 'SURGERY',
        clinicId,
      });
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

      expect(mockPrismaService.clinicShiftType.findFirst).toHaveBeenCalledWith({
        where: { clinicId, code: 'SURGERY' },
      });
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
      mockPrismaService.clinicShiftType.findFirst.mockResolvedValue({
        id: 'st-1',
        code: 'SURGERY',
        clinicId,
      });
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
    it('returns empty violations (stub for Story 6.2)', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        mockRule,
        { ...mockRule, id: 'rule-2', ruleType: 'SOFT' },
      ]);

      const result = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result).toEqual({
        hardViolations: [],
        softViolations: [],
      });
      expect(mockPrismaService.planningRule.findMany).toHaveBeenCalledWith({
        where: { clinicId, isActive: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
    });

    it('returns empty violations when no active rules', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([]);

      const result = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-31T23:59:59.999Z',
      });

      expect(result.hardViolations).toHaveLength(0);
      expect(result.softViolations).toHaveLength(0);
    });
  });
});
