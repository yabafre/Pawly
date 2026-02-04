import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

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
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should extract user fields from valid JWT payload', async () => {
      const payload = {
        sub: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
        clinicId: 'clinic-1',
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 'user-1',
        email: 'test@example.com',
        role: 'ADMIN',
        clinicId: 'clinic-1',
      });
    });

    it('should map sub to userId', async () => {
      const payload = {
        sub: 'user-abc-123',
        email: 'test@example.com',
        role: 'EMPLOYEE',
        clinicId: 'clinic-2',
      };

      const result = await strategy.validate(payload);

      expect(result.userId).toBe('user-abc-123');
      expect(result).not.toHaveProperty('sub');
    });

    it('should handle payload with undefined fields gracefully', async () => {
      const payload = {
        sub: undefined,
        email: undefined,
        role: undefined,
        clinicId: undefined,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: undefined,
        email: undefined,
        role: undefined,
        clinicId: undefined,
      });
    });
  });
});
