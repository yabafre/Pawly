import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '@/prisma/prisma.service';

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
  },
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-jwt-secret'),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user fields from valid JWT payload when user exists', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
        clinicId: 'clinic-1',
      };

      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
        clinicId: 'clinic-1',
      });

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
        clinicId: 'clinic-1',
      });
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', clinicId: 'clinic-1' },
      });
    });

    it('should throw UnauthorizedException when user no longer belongs to clinic', async () => {
      const payload = {
        sub: 'user-abc-123',
        email: 'test@example.com',
        role: 'EMPLOYEE',
        clinicId: 'clinic-2',
      };

      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('should use sub as the user identifier', async () => {
      const payload = {
        sub: 'user-abc-123',
        email: 'test@example.com',
        role: 'EMPLOYEE',
        clinicId: 'clinic-2',
      };

      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-abc-123',
        email: 'test@example.com',
        role: 'EMPLOYEE',
        clinicId: 'clinic-2',
      });

      const result = await strategy.validate(payload);

      expect(result.sub).toBe('user-abc-123');
      expect(result).not.toHaveProperty('userId');
    });
  });
});
