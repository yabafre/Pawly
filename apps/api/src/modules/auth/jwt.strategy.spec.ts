import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis';

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
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
        {
          provide: RedisService,
          useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
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

      mockPrismaService.user.findUnique.mockResolvedValue({
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
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, clinicId: true },
      });
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const payload = {
        sub: 'user-abc-123',
        email: 'test@example.com',
        role: 'EMPLOYEE',
        clinicId: 'clinic-2',
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      await expect(strategy.validate(payload)).rejects.toThrow('User not found');
    });

    it('should use sub as the user identifier', async () => {
      const payload = {
        sub: 'user-abc-123',
        email: 'test@example.com',
        role: 'EMPLOYEE',
        clinicId: 'clinic-2',
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-abc-123',
        email: 'test@example.com',
        role: 'EMPLOYEE',
        clinicId: 'clinic-2',
      });

      const result = await strategy.validate(payload);

      expect(result.sub).toBe('user-abc-123');
      expect(result).not.toHaveProperty('userId');
    });

    it('should resolve clinicId from the database user record', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
        clinicId: 'old-clinic-id',
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
        clinicId: 'current-clinic-id',
      });

      const result = await strategy.validate(payload);

      // clinicId should come from DB user record, not from JWT payload
      expect(result.clinicId).toBe('current-clinic-id');
      expect(result.clinicId).not.toBe('old-clinic-id');
    });

    it('should handle JWT payload without clinicId field (backward compatibility)', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
        clinicId: 'db-clinic-id',
      });

      const result = await strategy.validate(payload as any);
      expect(result.clinicId).toBe('db-clinic-id');
    });
  });
});
