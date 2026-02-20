import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PlanningTemplateService } from './planning-template.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ClinicService } from '@/modules/clinic/clinic.service';

describe('PlanningTemplateService', () => {
  let service: PlanningTemplateService;

  const mockPrisma = {
    planningTemplate: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockClinicService = {
    listShiftTypes: jest.fn(),
  };

  const clinicId = 'clinic-123';

  const mockShiftTypes = [
    { id: 'st-1', code: 'SURGERY', name: 'Surgery', color: '#ff0000', startTime: '08:00', endTime: '12:00' },
    { id: 'st-2', code: 'RECEPTION', name: 'Reception', color: '#00ff00', startTime: '09:00', endTime: '17:00' },
  ];

  const validTemplateData = {
    days: [
      {
        dayOfWeek: 1,
        slots: [
          { shiftTypeCode: 'SURGERY', requiredStaff: 2 },
          { shiftTypeCode: 'RECEPTION', requiredStaff: 1 },
        ],
      },
      {
        dayOfWeek: 2,
        slots: [{ shiftTypeCode: 'SURGERY', requiredStaff: 1 }],
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClinicService, useValue: mockClinicService },
      ],
    }).compile();

    service = module.get<PlanningTemplateService>(PlanningTemplateService);
    jest.clearAllMocks();
    mockClinicService.listShiftTypes.mockResolvedValue(mockShiftTypes);
  });

  // ─── createTemplate ──────────────────────────────────────────────

  describe('createTemplate', () => {
    it('creates record with correct clinicId and validated data', async () => {
      const created = { id: 'tmpl-1', name: 'Standard', clinicId, data: validTemplateData };
      mockPrisma.planningTemplate.create.mockResolvedValue(created);

      const result = await service.createTemplate(clinicId, {
        name: 'Standard',
        data: validTemplateData,
      });

      expect(result).toEqual(created);
      expect(mockPrisma.planningTemplate.create).toHaveBeenCalledWith({
        data: {
          clinicId,
          name: 'Standard',
          data: validTemplateData,
        },
      });
    });

    it('rejects invalid shiftTypeCode (not in clinic shift types)', async () => {
      await expect(
        service.createTemplate(clinicId, {
          name: 'Bad',
          data: {
            days: [
              {
                dayOfWeek: 1,
                slots: [{ shiftTypeCode: 'INVALID_TYPE', requiredStaff: 1 }],
              },
            ],
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts empty days array', async () => {
      const created = { id: 'tmpl-2', name: 'Empty', clinicId, data: { days: [] } };
      mockPrisma.planningTemplate.create.mockResolvedValue(created);

      const result = await service.createTemplate(clinicId, {
        name: 'Empty',
        data: { days: [] },
      });

      expect(result).toEqual(created);
    });
  });

  // ─── listTemplates ───────────────────────────────────────────────

  describe('listTemplates', () => {
    it('returns only templates for authenticated clinic', async () => {
      const templates = [
        { id: 'tmpl-1', name: 'A', clinicId, data: { days: [] } },
        { id: 'tmpl-2', name: 'B', clinicId, data: { days: [] } },
      ];
      mockPrisma.planningTemplate.findMany.mockResolvedValue(templates);

      const result = await service.listTemplates(clinicId);

      expect(result).toEqual(templates);
      expect(mockPrisma.planningTemplate.findMany).toHaveBeenCalledWith({
        where: { clinicId },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('returns templates ordered by updatedAt desc', async () => {
      mockPrisma.planningTemplate.findMany.mockResolvedValue([]);

      await service.listTemplates(clinicId);

      expect(mockPrisma.planningTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: 'desc' } }),
      );
    });
  });

  // ─── getTemplateById ─────────────────────────────────────────────

  describe('getTemplateById', () => {
    it('returns template when clinicId matches', async () => {
      const template = { id: 'tmpl-1', name: 'Test', clinicId, data: { days: [] } };
      mockPrisma.planningTemplate.findFirst.mockResolvedValue(template);

      const result = await service.getTemplateById(clinicId, 'tmpl-1');

      expect(result).toEqual(template);
      expect(mockPrisma.planningTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'tmpl-1', clinicId },
      });
    });

    it('throws NotFoundException for wrong clinic', async () => {
      mockPrisma.planningTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getTemplateById(clinicId, 'tmpl-999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateTemplate ──────────────────────────────────────────────

  describe('updateTemplate', () => {
    it('verifies clinic ownership before update', async () => {
      const existing = { id: 'tmpl-1', name: 'Old', clinicId, data: { days: [] } };
      mockPrisma.planningTemplate.findFirst.mockResolvedValue(existing);
      mockPrisma.planningTemplate.update.mockResolvedValue({
        ...existing,
        name: 'Updated',
        data: validTemplateData,
      });

      await service.updateTemplate(clinicId, {
        id: 'tmpl-1',
        name: 'Updated',
        data: validTemplateData,
      });

      expect(mockPrisma.planningTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'tmpl-1', clinicId },
      });
    });

    it('validates shiftTypeCode references', async () => {
      const existing = { id: 'tmpl-1', name: 'Old', clinicId, data: { days: [] } };
      mockPrisma.planningTemplate.findFirst.mockResolvedValue(existing);

      await expect(
        service.updateTemplate(clinicId, {
          id: 'tmpl-1',
          name: 'Updated',
          data: {
            days: [
              {
                dayOfWeek: 1,
                slots: [{ shiftTypeCode: 'NONEXISTENT', requiredStaff: 1 }],
              },
            ],
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for non-owned template', async () => {
      mockPrisma.planningTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTemplate(clinicId, {
          id: 'tmpl-999',
          name: 'Updated',
          data: { days: [] },
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteTemplate ──────────────────────────────────────────────

  describe('deleteTemplate', () => {
    it('verifies clinic ownership before deletion', async () => {
      mockPrisma.planningTemplate.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteTemplate(clinicId, 'tmpl-1');

      expect(result).toEqual({ id: 'tmpl-1' });
      expect(mockPrisma.planningTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: 'tmpl-1', clinicId },
      });
    });

    it('throws NotFoundException for non-existent template', async () => {
      mockPrisma.planningTemplate.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deleteTemplate(clinicId, 'tmpl-999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── duplicateTemplate ───────────────────────────────────────────

  describe('duplicateTemplate', () => {
    it('creates copy with "(Copy)" suffix', async () => {
      const original = {
        id: 'tmpl-1',
        name: 'Standard Week',
        clinicId,
        data: validTemplateData,
      };
      mockPrisma.planningTemplate.findFirst.mockResolvedValue(original);
      mockPrisma.planningTemplate.create.mockResolvedValue({
        id: 'tmpl-2',
        name: 'Standard Week (Copy)',
        clinicId,
        data: validTemplateData,
      });

      const result = await service.duplicateTemplate(clinicId, 'tmpl-1');

      expect(result.name).toBe('Standard Week (Copy)');
      expect(mockPrisma.planningTemplate.create).toHaveBeenCalledWith({
        data: {
          clinicId,
          name: 'Standard Week (Copy)',
          data: validTemplateData,
        },
      });
    });

    it('validates original data before duplicating', async () => {
      const originalWithBadCode = {
        id: 'tmpl-1',
        name: 'Bad Template',
        clinicId,
        data: {
          days: [
            {
              dayOfWeek: 1,
              slots: [{ shiftTypeCode: 'NONEXISTENT', requiredStaff: 1 }],
            },
          ],
        },
      };
      mockPrisma.planningTemplate.findFirst.mockResolvedValue(originalWithBadCode);

      await expect(
        service.duplicateTemplate(clinicId, 'tmpl-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.planningTemplate.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for wrong clinic template', async () => {
      mockPrisma.planningTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.duplicateTemplate(clinicId, 'tmpl-999'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── clinic isolation ────────────────────────────────────────────

  describe('clinic isolation', () => {
    it('cannot read templates from another clinic', async () => {
      mockPrisma.planningTemplate.findFirst.mockResolvedValue(null);

      await expect(
        service.getTemplateById('other-clinic', 'tmpl-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('cannot delete templates from another clinic', async () => {
      mockPrisma.planningTemplate.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deleteTemplate('other-clinic', 'tmpl-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── validateTemplateData ────────────────────────────────────────

  describe('validateTemplateData', () => {
    it('rejects invalid job type values', async () => {
      await expect(
        service.validateTemplateData(clinicId, {
          days: [
            {
              dayOfWeek: 1,
              slots: [
                {
                  shiftTypeCode: 'SURGERY',
                  requiredStaff: 1,
                  requiredJobTypes: ['INVALID_JOB' as any],
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid job type values', async () => {
      await expect(
        service.validateTemplateData(clinicId, {
          days: [
            {
              dayOfWeek: 1,
              slots: [
                {
                  shiftTypeCode: 'SURGERY',
                  requiredStaff: 1,
                  requiredJobTypes: ['VET', 'ASV'],
                },
              ],
            },
          ],
        }),
      ).resolves.not.toThrow();
    });
  });
});
