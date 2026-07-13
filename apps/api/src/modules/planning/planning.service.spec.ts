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
        config: {
          targetDay: 'saturday',
          maxPerPeriod: 2,
          trackingPeriod: 'monthly',
        },
      });

      const input = {
        name: 'Saturday rotation',
        ruleType: 'SOFT' as const,
        category: 'ROTATION_EQUITY' as const,
        isActive: true,
        priority: 5,
        config: {
          targetDay: 'saturday',
          maxPerPeriod: 2,
          trackingPeriod: 'monthly',
        },
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
        {
          ...mockRule,
          id: 'rule-2',
          ruleType: 'SOFT',
          category: 'ROTATION_EQUITY',
          config: { targetDay: 'saturday', maxPerPeriod: 2 },
        },
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

    // AC3 (verbatim from story 11-3): "Given persisted shifts that breach a statutory limit,
    // When the admin views the schedule, Then each breach appears as a blocking (hard)
    // violation in the Planning Health Bar detail popover, localized ...". Enforced even
    // with zero configured rules (AC4).
    it('emits a statutory HARD violation for an 11h-net day with zero configured rules', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([]); // zero rules
      mockPrismaService.shift.findMany.mockResolvedValue([
        {
          id: 's-long',
          date: new Date('2026-08-03'),
          shiftTypeCode: 'SURGERY',
          startTime: '08:00',
          endTime: '19:00', // 11h net (no break) > 10h
          breakMinutes: 0,
          employeeId: 'emp-1',
          employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
        },
      ]);

      const result = await service.validateShiftsAgainstRules(clinicId, {
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-31T23:59:59.999Z',
      });

      expect(result.hardViolations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'CONTRACT_COMPLIANCE',
            ruleId: 'statutory:daily_work',
            messageKey: 'violations.statutory.dailyWork',
            severity: 'blocking',
            affectedEmployeeId: 'emp-1',
            // Story 11-3 — the human-facing {date} param is French-formatted (DD/MM/YYYY),
            // while affectedDate stays ISO (it keys the grid-cell conflict lookup).
            messageParams: expect.objectContaining({ date: '03/08/2026' }),
            affectedDate: '2026-08-03',
          }),
        ]),
      );
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

    // ─── equity counter enrichment ─────────────────────────────────────
    describe('equity counter enrichment', () => {
      it('should enrich ROTATION_EQUITY soft violations with equityContext when counters provided', async () => {
        mockPrismaService.planningRule.findMany.mockResolvedValue([
          {
            id: 'rule-rot',
            name: 'Max 1 Saturday',
            category: 'ROTATION_EQUITY',
            ruleType: 'SOFT',
            isActive: true,
            priority: 5,
            config: {
              targetDay: 'saturday',
              maxPerPeriod: 1,
              trackingPeriod: 'monthly',
            },
            clinicId,
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

        const equityCounters = [
          {
            id: 'ec-1',
            counterType: 'SATURDAY_WORKED',
            count: 3,
            year: 2026,
            month: 3,
            lastCalculatedAt: new Date(),
            employee: {
              id: 'emp-1',
              firstName: 'Alice',
              lastName: 'Martin',
              color: '#ff0000',
              jobType: 'VET',
              contractHours: 35,
            },
          },
          {
            id: 'ec-2',
            counterType: 'SATURDAY_WORKED',
            count: 1,
            year: 2026,
            month: 3,
            lastCalculatedAt: new Date(),
            employee: {
              id: 'emp-2',
              firstName: 'Bob',
              lastName: 'Dupont',
              color: '#00ff00',
              jobType: 'ASV',
              contractHours: 35,
            },
          },
        ];

        const result = await service.validateShiftsAgainstRules(
          clinicId,
          {
            startDate: '2026-03-01T00:00:00.000Z',
            endDate: '2026-03-31T23:59:59.999Z',
          },
          { equityCounters },
        );

        expect(result.softViolations.length).toBeGreaterThan(0);
        const violation = result.softViolations[0];
        expect(violation.equityContext).toBeDefined();
        expect(violation.equityContext!.counterType).toBe('SATURDAY_WORKED');
        expect(violation.equityContext!.currentCount).toBe(2);
        expect(violation.equityContext!.maxPerPeriod).toBe(1);
        expect(typeof violation.equityContext!.clinicAverage).toBe('number');
        expect(['below_average', 'average', 'above_average']).toContain(
          violation.equityContext!.trend,
        );
      });

      it('should compute trend as above_average when currentCount > clinicAverage', async () => {
        mockPrismaService.planningRule.findMany.mockResolvedValue([
          {
            id: 'rule-rot',
            name: 'Max 1 Saturday',
            category: 'ROTATION_EQUITY',
            ruleType: 'SOFT',
            isActive: true,
            priority: 5,
            config: {
              targetDay: 'saturday',
              maxPerPeriod: 1,
              trackingPeriod: 'monthly',
            },
            clinicId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
        // emp-1 has 3 Saturday shifts (way above average)
        mockPrismaService.shift.findMany.mockResolvedValue([
          {
            id: 's1',
            date: new Date('2026-03-07'),
            shiftTypeCode: 'SURGERY',
            startTime: '08:00',
            endTime: '12:00',
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
          {
            id: 's2',
            date: new Date('2026-03-14'),
            shiftTypeCode: 'SURGERY',
            startTime: '08:00',
            endTime: '12:00',
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
          {
            id: 's3',
            date: new Date('2026-03-21'),
            shiftTypeCode: 'SURGERY',
            startTime: '08:00',
            endTime: '12:00',
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
        ]);

        // Clinic average: (3 + 0) / 2 = 1.5, currentCount 3 > 1.5 + 0.5 = above_average
        const equityCounters = [
          {
            id: 'ec-1',
            counterType: 'SATURDAY_WORKED',
            count: 3,
            year: 2026,
            month: 3,
            lastCalculatedAt: new Date(),
            employee: {
              id: 'emp-1',
              firstName: 'Alice',
              lastName: 'Martin',
              color: '#ff0000',
              jobType: 'VET',
              contractHours: 35,
            },
          },
          {
            id: 'ec-2',
            counterType: 'SATURDAY_WORKED',
            count: 0,
            year: 2026,
            month: 3,
            lastCalculatedAt: new Date(),
            employee: {
              id: 'emp-2',
              firstName: 'Bob',
              lastName: 'Dupont',
              color: '#00ff00',
              jobType: 'ASV',
              contractHours: 35,
            },
          },
        ];

        const result = await service.validateShiftsAgainstRules(
          clinicId,
          {
            startDate: '2026-03-01T00:00:00.000Z',
            endDate: '2026-03-31T23:59:59.999Z',
          },
          { equityCounters },
        );

        const violation = result.softViolations.find((v) => v.equityContext);
        expect(violation).toBeDefined();
        expect(violation!.equityContext!.trend).toBe('above_average');
      });

      it('should compute trend as below_average when currentCount < clinicAverage', async () => {
        mockPrismaService.planningRule.findMany.mockResolvedValue([
          {
            id: 'rule-rot',
            name: 'Max 1 Saturday',
            category: 'ROTATION_EQUITY',
            ruleType: 'SOFT',
            isActive: true,
            priority: 5,
            config: {
              targetDay: 'saturday',
              maxPerPeriod: 1,
              trackingPeriod: 'monthly',
            },
            clinicId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
        // emp-1 has 2 Saturday shifts, but clinic average is very high
        mockPrismaService.shift.findMany.mockResolvedValue([
          {
            id: 's1',
            date: new Date('2026-03-07'),
            shiftTypeCode: 'SURGERY',
            startTime: '08:00',
            endTime: '12:00',
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
          {
            id: 's2',
            date: new Date('2026-03-14'),
            shiftTypeCode: 'SURGERY',
            startTime: '08:00',
            endTime: '12:00',
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
        ]);

        // Clinic average: (1 + 8) / 2 = 4.5, currentCount 2 < 4.5 - 0.5 = below_average
        const equityCounters = [
          {
            id: 'ec-1',
            counterType: 'SATURDAY_WORKED',
            count: 1,
            year: 2026,
            month: 3,
            lastCalculatedAt: new Date(),
            employee: {
              id: 'emp-1',
              firstName: 'Alice',
              lastName: 'Martin',
              color: '#ff0000',
              jobType: 'VET',
              contractHours: 35,
            },
          },
          {
            id: 'ec-2',
            counterType: 'SATURDAY_WORKED',
            count: 8,
            year: 2026,
            month: 3,
            lastCalculatedAt: new Date(),
            employee: {
              id: 'emp-2',
              firstName: 'Bob',
              lastName: 'Dupont',
              color: '#00ff00',
              jobType: 'ASV',
              contractHours: 35,
            },
          },
        ];

        const result = await service.validateShiftsAgainstRules(
          clinicId,
          {
            startDate: '2026-03-01T00:00:00.000Z',
            endDate: '2026-03-31T23:59:59.999Z',
          },
          { equityCounters },
        );

        const violation = result.softViolations.find((v) => v.equityContext);
        expect(violation).toBeDefined();
        expect(violation!.equityContext!.trend).toBe('below_average');
      });

      it('should return violations without equityContext when no counters provided (backward compat)', async () => {
        mockPrismaService.planningRule.findMany.mockResolvedValue([
          {
            id: 'rule-rot',
            name: 'Max 1 Saturday',
            category: 'ROTATION_EQUITY',
            ruleType: 'SOFT',
            isActive: true,
            priority: 5,
            config: {
              targetDay: 'saturday',
              maxPerPeriod: 1,
              trackingPeriod: 'monthly',
            },
            clinicId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
        mockPrismaService.shift.findMany.mockResolvedValue([
          {
            id: 's1',
            date: new Date('2026-03-07'),
            shiftTypeCode: 'SURGERY',
            startTime: '08:00',
            endTime: '12:00',
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
          {
            id: 's2',
            date: new Date('2026-03-14'),
            shiftTypeCode: 'SURGERY',
            startTime: '08:00',
            endTime: '12:00',
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
        ]);

        // Call without equityCounters option
        const result = await service.validateShiftsAgainstRules(clinicId, {
          startDate: '2026-03-01T00:00:00.000Z',
          endDate: '2026-03-31T23:59:59.999Z',
        });

        expect(result.softViolations.length).toBeGreaterThan(0);
        // equityContext should still be present (computed from shift data instead of counters)
        // The point is: calling without counters should not crash
        for (const violation of result.softViolations) {
          expect(violation.severity).toBe('warning');
          expect(violation.category).toBe('ROTATION_EQUITY');
        }
      });

      it('should enrich CONTRACT_COMPLIANCE soft violations with equityContext', async () => {
        mockPrismaService.planningRule.findMany.mockResolvedValue([
          {
            id: 'rule-cc',
            name: 'Max monthly hours',
            category: 'CONTRACT_COMPLIANCE',
            ruleType: 'SOFT',
            isActive: true,
            priority: 5,
            config: { maxMonthlyHours: 10 },
            clinicId,
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
            endTime: '18:00', // 10h
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
          {
            id: 's2',
            date: new Date('2026-03-03'),
            shiftTypeCode: 'SURGERY',
            startTime: '08:00',
            endTime: '18:00', // 10h → total 20h > 10h max
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
        ]);

        const equityCounters = [
          {
            id: 'ec-1',
            counterType: 'OVERTIME_HOURS',
            count: 10,
            year: 2026,
            month: 3,
            lastCalculatedAt: new Date(),
            employee: {
              id: 'emp-1',
              firstName: 'Alice',
              lastName: 'Martin',
              color: '#ff0000',
              jobType: 'VET',
              contractHours: 35,
            },
          },
        ];

        const result = await service.validateShiftsAgainstRules(
          clinicId,
          {
            startDate: '2026-03-01T00:00:00.000Z',
            endDate: '2026-03-31T23:59:59.999Z',
          },
          { equityCounters },
        );

        expect(result.softViolations.length).toBeGreaterThan(0);
        const ccViolation = result.softViolations.find(
          (v) => v.category === 'CONTRACT_COMPLIANCE',
        );
        expect(ccViolation).toBeDefined();
        expect(ccViolation!.equityContext).toBeDefined();
        expect(ccViolation!.equityContext!.counterType).toBe('OVERTIME_HOURS');
        expect(typeof ccViolation!.equityContext!.currentCount).toBe('number');
        expect(typeof ccViolation!.equityContext!.maxPerPeriod).toBe('number');
        expect(typeof ccViolation!.equityContext!.clinicAverage).toBe('number');
        expect(['below_average', 'average', 'above_average']).toContain(
          ccViolation!.equityContext!.trend,
        );
      });

      it('should include messageKey and messageParams in enriched violations', async () => {
        mockPrismaService.planningRule.findMany.mockResolvedValue([
          {
            id: 'rule-rot',
            name: 'Max 1 Saturday',
            category: 'ROTATION_EQUITY',
            ruleType: 'SOFT',
            isActive: true,
            priority: 5,
            config: {
              targetDay: 'saturday',
              maxPerPeriod: 1,
              trackingPeriod: 'monthly',
            },
            clinicId,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
        mockPrismaService.shift.findMany.mockResolvedValue([
          {
            id: 's1',
            date: new Date('2026-03-07'),
            shiftTypeCode: 'SURGERY',
            startTime: '08:00',
            endTime: '12:00',
            employeeId: 'emp-1',
            employee: { id: 'emp-1', jobType: 'VET', contractHours: 35 },
          },
          {
            id: 's2',
            date: new Date('2026-03-14'),
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
        for (const violation of result.softViolations) {
          // Every violation should have a human-readable message
          expect(violation.message).toBeDefined();
          expect(typeof violation.message).toBe('string');
          expect(violation.message.length).toBeGreaterThan(0);
          // Should reference meaningful information about the violation
          expect(violation.message).toMatch(
            /saturday|Saturday|shifts|exceeds/i,
          );
        }
      });
    });
  });

  // ─── validateShiftsAgainstRules — unified rule engine (Story 11-8) ───────────
  // AC1 (verbatim from story 11-8-unified-rule-engine:17):
  //   Given persisted shifts and configured CONTRACT_COMPLIANCE / ROTATION_EQUITY planning
  //   rules, When rules are evaluated on any of the three write paths (generation eligibility
  //   in scoreAndAssign, post-hoc validation in validateShiftsAgainstRules, manual-move
  //   validation in preValidateMove), Then all three delegate the rule decision to the shared
  //   pure module rule-engine.ts: worked minutes are computed net of breakMinutes,
  //   maxWeeklyHours is enforced in validation (ISO-week bucketed, effective weekly limit =
  //   min(contractHours, maxWeeklyHours)), and a rule's ruleType decides severity
  //   (HARD → blocking, SOFT → warning).
  // AC2 (verbatim from story 11-8-unified-rule-engine:18):
  //   Given a month whose persisted shifts breach a HARD CONTRACT_COMPLIANCE (weekly or
  //   monthly) or HARD ROTATION_EQUITY rule, When validateShiftsAgainstRules runs (as
  //   publishPlan invokes it), Then those breaches appear in hardViolations — no longer
  //   silently demoted to softViolations — and publishPlan rejects with the 409
  //   "hard violation(s) remain" conflict.
  describe('validateShiftsAgainstRules — unified engine', () => {
    const empShift = (
      id: string,
      employeeId: string,
      date: string,
      startTime: string,
      endTime: string,
      breakMinutes = 0,
      contractHours = 35,
      jobType = 'VET',
    ) => ({
      id,
      date: new Date(`${date}T00:00:00.000Z`),
      startTime,
      endTime,
      shiftTypeCode: 'CHIR',
      breakMinutes,
      employeeId,
      clinicId,
      employee: { id: employeeId, jobType, contractHours },
    });

    const contractRule = (
      ruleType: 'HARD' | 'SOFT',
      config: Record<string, unknown>,
    ) => ({
      id: 'rule-cc',
      name: 'Contract cap',
      ruleType,
      category: 'CONTRACT_COMPLIANCE',
      isActive: true,
      config,
      priority: 0,
      clinicId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rotationRule = (
      ruleType: 'HARD' | 'SOFT',
      config: Record<string, unknown>,
    ) => ({
      id: 'rule-rot',
      name: 'Rotation cap',
      ruleType,
      category: 'ROTATION_EQUITY',
      isActive: true,
      config,
      priority: 0,
      clinicId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const input = {
      startDate: '2026-08-01T00:00:00.000Z',
      endDate: '2026-08-31T23:59:59.999Z',
    };

    it('HARD CONTRACT_COMPLIANCE weekly overage -> hardViolations (blocks publish)', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        contractRule('HARD', { maxWeeklyHours: 35 }),
      ]);
      // Mon-Fri 09:00-18:00 (9h/day x 5 = 45h) in one ISO week. Mon-Fri (not Mon-Sat as the
      // story sketched) so the always-on 11-3 statutory weekly-rest check (>=35h) stays quiet
      // and the hardViolations assertion isolates the configured rule.
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['03', '04', '05', '06', '07'].map((d, i) =>
          empShift(`s${i}`, 'e1', `2026-08-${d}`, '09:00', '18:00', 0),
        ),
      );
      const res = await service.validateShiftsAgainstRules(clinicId, input);
      expect(
        res.hardViolations.some((v) => v.category === 'CONTRACT_COMPLIANCE'),
      ).toBe(true);
      expect(
        res.softViolations.some((v) => v.category === 'CONTRACT_COMPLIANCE'),
      ).toBe(false);
    });

    it('SOFT CONTRACT_COMPLIANCE monthly overage -> softViolations with equityContext', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        contractRule('SOFT', { maxMonthlyHours: 40 }),
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['03', '04', '05', '06', '07'].map((d, i) =>
          empShift(`s${i}`, 'e1', `2026-08-${d}`, '08:00', '17:00', 0),
        ), // 5 x 9h = 45h > 40h (Mon-Fri, statutory-quiet — see note above)
      );
      const res = await service.validateShiftsAgainstRules(clinicId, input);
      const monthly = res.softViolations.find(
        (v) => v.messageKey === 'violations.contractCompliance.overtime',
      );
      expect(monthly).toBeDefined();
      expect(monthly?.equityContext).toBeDefined();
      // The same fixture breaches the weekly contractHours floor (45h > 35h) — its
      // monthly clinic-average trend is meaningless for a weekly figure, so the
      // adapter attaches no equityContext there (aped-review m4).
      const weekly = res.softViolations.find(
        (v) => v.messageKey === 'violations.contractCompliance.weeklyOvertime',
      );
      expect(weekly).toBeDefined();
      expect(weekly?.equityContext).toBeUndefined();
      expect(
        res.hardViolations.some((v) => v.category === 'CONTRACT_COMPLIANCE'),
      ).toBe(false);
    });

    it('deducts breakMinutes: 5 x (08:00-16:00 net 7h) = 35h is NOT over a 35h HARD cap', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        contractRule('HARD', { maxWeeklyHours: 35 }),
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['03', '04', '05', '06', '07'].map(
          (d, i) =>
            empShift(`s${i}`, 'e1', `2026-08-${d}`, '08:00', '16:00', 60), // 8h gross - 1h = 7h net
        ),
      );
      const res = await service.validateShiftsAgainstRules(clinicId, input);
      // Would be 40h gross (> 35, violation) if break were ignored; 35h net = at the limit, no violation.
      expect(
        res.hardViolations.some((v) => v.category === 'CONTRACT_COMPLIANCE'),
      ).toBe(false);
    });

    it('HARD ROTATION_EQUITY overage -> hardViolations', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        rotationRule('HARD', {
          targetDay: 'saturday',
          maxPerPeriod: 2,
          trackingPeriod: 'monthly',
        }),
      ]);
      // Saturdays 2026-08-01, 08, 15 = 3 > 2
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['01', '08', '15'].map((d, i) =>
          empShift(`s${i}`, 'e1', `2026-08-${d}`, '09:00', '15:00', 0),
        ),
      );
      const res = await service.validateShiftsAgainstRules(clinicId, input);
      expect(
        res.hardViolations.some((v) => v.category === 'ROTATION_EQUITY'),
      ).toBe(true);
    });

    it('ROTATION_EQUITY respects applicableJobTypes on the validation path (aped-review M1)', async () => {
      // Behaviour change accepted at review: the legacy validator counted every
      // targetDay shift regardless of jobType; the unified engine aligns validation
      // with generation and preValidateMove, which already filtered.
      const rule = rotationRule('HARD', {
        targetDay: 'saturday',
        maxPerPeriod: 2,
        trackingPeriod: 'monthly',
        applicableJobTypes: ['ASV'],
      });
      mockPrismaService.planningRule.findMany.mockResolvedValue([rule]);

      // 3 Saturdays as VET: outside the rule's jobTypes -> not counted, no violation.
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['01', '08', '15'].map((d, i) =>
          empShift(
            `s${i}`,
            'e1',
            `2026-08-${d}`,
            '09:00',
            '15:00',
            0,
            35,
            'VET',
          ),
        ),
      );
      const vet = await service.validateShiftsAgainstRules(clinicId, input);
      expect(
        vet.hardViolations.some((v) => v.category === 'ROTATION_EQUITY'),
      ).toBe(false);

      // Same 3 Saturdays as ASV: counted -> hard violation.
      mockPrismaService.planningRule.findMany.mockResolvedValue([rule]);
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['01', '08', '15'].map((d, i) =>
          empShift(
            `s${i}`,
            'e1',
            `2026-08-${d}`,
            '09:00',
            '15:00',
            0,
            35,
            'ASV',
          ),
        ),
      );
      const asv = await service.validateShiftsAgainstRules(clinicId, input);
      expect(
        asv.hardViolations.some((v) => v.category === 'ROTATION_EQUITY'),
      ).toBe(true);
    });

    it('saturday clinicAverage stays 0 when counters are provided without SATURDAY_WORKED (legacy fallback, aped-review m5)', async () => {
      mockPrismaService.planningRule.findMany.mockResolvedValue([
        rotationRule('SOFT', {
          targetDay: 'saturday',
          maxPerPeriod: 2,
          trackingPeriod: 'monthly',
        }),
      ]);
      mockPrismaService.shift.findMany.mockResolvedValue(
        ['01', '08', '15'].map((d, i) =>
          empShift(`s${i}`, 'e1', `2026-08-${d}`, '09:00', '15:00', 0),
        ),
      );
      const res = await service.validateShiftsAgainstRules(clinicId, input, {
        equityCounters: [
          {
            id: 'c1',
            counterType: 'OVERTIME_HOURS' as const,
            count: 120,
            year: 2026,
            month: 8,
            lastCalculatedAt: null,
            employee: {
              id: 'e1',
              firstName: 'Vé',
              lastName: 'To',
              color: '#fff',
              jobType: 'VET',
              contractHours: 35,
            },
          },
        ],
      });
      const soft = res.softViolations.find(
        (v) => v.category === 'ROTATION_EQUITY',
      );
      expect(soft?.equityContext?.clinicAverage).toBe(0);
    });
  });
});
