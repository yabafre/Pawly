import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '@/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '@/modules/mail/mail.service';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let mailService: MailService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    magicLink: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
  };

  const mockMailService = {
    sendMagicLink: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        WEB_APP_URL: 'http://localhost:3000',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    mailService = module.get<MailService>(MailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    const email = 'test@example.com';
    const password = 'Password1';
    const clinicId = '00000000-0000-4000-8000-000000000001';

    it('should return user without password if credentials are valid', async () => {
      const hashedPassword = await bcrypt.hash(password, 10);
      const mockUser = {
        id: 'user-1',
        email,
        password: hashedPassword,
        role: 'EMPLOYEE',
        clinicId,
      };
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.validateUser(email, password, clinicId);

      expect(result).toEqual({
        id: 'user-1',
        email,
        role: 'EMPLOYEE',
        clinicId,
      });
      expect(result).not.toHaveProperty('password');
    });

    it('should return null if user not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      const result = await service.validateUser(email, password, clinicId);

      expect(result).toBeNull();
    });

    it('should return null if password does not match', async () => {
      const hashedPassword = await bcrypt.hash('DifferentPassword1', 10);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email,
        password: hashedPassword,
        role: 'EMPLOYEE',
        clinicId,
      });

      const result = await service.validateUser(email, 'WrongPassword1', clinicId);

      expect(result).toBeNull();
    });

    it('should return null if user has no password set', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email,
        password: null,
        role: 'EMPLOYEE',
        clinicId,
      });

      const result = await service.validateUser(email, password, clinicId);

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password1',
      clinicId: '00000000-0000-4000-8000-000000000001',
    };

    it('should return tokens and user on successful login', async () => {
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      const mockUser = {
        id: 'user-1',
        email: loginDto.email,
        password: hashedPassword,
        role: 'ADMIN',
        clinicId: loginDto.clinicId,
      };
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
      expect(result.user).not.toHaveProperty('password');
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2); // access + refresh
    });

    it('should include all required fields in JWT payload', async () => {
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        password: hashedPassword,
        role: 'ADMIN',
        clinicId: loginDto.clinicId,
      });

      await service.login(loginDto);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          email: loginDto.email,
          sub: 'user-1',
          role: 'ADMIN',
          clinicId: loginDto.clinicId,
        }),
      );
    });

    it('should generate refresh token with 7d expiry (NFR8)', async () => {
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        password: hashedPassword,
        role: 'ADMIN',
        clinicId: loginDto.clinicId,
      });

      await service.login(loginDto);

      // Second call is the refresh token
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        { expiresIn: '7d' },
      );
    });

    it('should generate access token without explicit expiresIn (uses module default 1d/24h - NFR8)', async () => {
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        password: hashedPassword,
        role: 'ADMIN',
        clinicId: loginDto.clinicId,
      });

      await service.login(loginDto);

      // First call is the access token — no explicit expiresIn (defaults to module config '1d')
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
      );
      // Verify it was NOT called with an expiresIn override
      const firstCallArgs = mockJwtService.sign.mock.calls[0];
      expect(firstCallArgs.length).toBe(1); // only payload, no options
    });

    it('should throw UnauthorizedException on invalid credentials', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    const registerDto = {
      email: 'new@example.com',
      password: 'Password1',
      firstName: 'John',
      lastName: 'Doe',
      jobType: 'VET' as const,
    };

    it('should throw ForbiddenException (registration disabled)', async () => {
      await expect(service.register(registerDto)).rejects.toThrow(ForbiddenException);
      await expect(service.register(registerDto)).rejects.toThrow(
        'Registration is disabled. Account creation happens via subscription checkout.',
      );
    });
  });

  describe('requestMagicLink', () => {
    it('should return success message if user not found (prevent enumeration)', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      const result = await service.requestMagicLink(
        'nonexistent@example.com',
        '00000000-0000-4000-8000-000000000001',
      );

      expect(result).toEqual({ message: 'If an account exists, a magic link has been sent' });
      expect(mockMailService.sendMagicLink).not.toHaveBeenCalled();
    });

    it('should create a magic link and send an email if user exists', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        clinicId: '00000000-0000-4000-8000-000000000001',
      };
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockImplementation(({ data }) => Promise.resolve(data));

      const result = await service.requestMagicLink(
        'test@example.com',
        '00000000-0000-4000-8000-000000000001',
      );

      expect(prisma.magicLink.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          clinicId: '00000000-0000-4000-8000-000000000001',
          token: expect.any(String),
        }),
      }));

      expect(mailService.sendMagicLink).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringMatching(/token=[a-f0-9]{64}/),
      );
      expect(result).toEqual({ message: 'If an account exists, a magic link has been sent' });
    });

    it('should store a SHA-256 hashed token, not the raw token (NFR5)', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        clinicId: 'clinic-1',
      };
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockImplementation(({ data }) => Promise.resolve(data));

      await service.requestMagicLink('test@example.com', 'clinic-1');

      const createCall = mockPrismaService.magicLink.create.mock.calls[0][0];
      const storedToken = createCall.data.token;

      // Stored token must be a 64-char hex string (SHA-256 hash)
      expect(storedToken).toMatch(/^[a-f0-9]{64}$/);

      // The URL sent to mail must contain a DIFFERENT token (the raw one)
      const mailUrl = mockMailService.sendMagicLink.mock.calls[0][1];
      const rawTokenInUrl = mailUrl.match(/token=([a-f0-9]{64})/)?.[1];
      expect(rawTokenInUrl).toBeDefined();

      // Verify stored hash != raw token (they should differ because one is hashed)
      // Hash the raw token and it should equal the stored token
      const expectedHash = crypto.createHash('sha256').update(rawTokenInUrl!).digest('hex');
      expect(storedToken).toBe(expectedHash);
    });

    it('should set magic link TTL to 15 minutes (NFR5)', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        clinicId: 'clinic-1',
      };
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockImplementation(({ data }) => Promise.resolve(data));

      const beforeCreate = Date.now();
      await service.requestMagicLink('test@example.com', 'clinic-1');
      const afterCreate = Date.now();

      const createCall = mockPrismaService.magicLink.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;

      // expiresAt should be ~15 minutes from now
      const minExpected = beforeCreate + 14 * 60 * 1000; // 14 min (tolerance)
      const maxExpected = afterCreate + 16 * 60 * 1000;  // 16 min (tolerance)

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(minExpected);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(maxExpected);
    });

    it('should return identical messages for existing and non-existing users', async () => {
      // Non-existing user
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      const result1 = await service.requestMagicLink('no@example.com', 'clinic-1');

      // Existing user
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'yes@example.com',
        clinicId: 'clinic-1',
      });
      mockPrismaService.magicLink.create.mockResolvedValue({});
      const result2 = await service.requestMagicLink('yes@example.com', 'clinic-1');

      expect(result1.message).toBe(result2.message);
    });

    it('should throw if email sending fails', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        clinicId: 'clinic-1',
      };
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockResolvedValue({});
      mockMailService.sendMagicLink.mockRejectedValueOnce(new Error('Resend API error'));

      await expect(
        service.requestMagicLink('test@example.com', 'clinic-1'),
      ).rejects.toThrow();
    });
  });

  describe('validateMagicLink', () => {
    function mockTransaction(mockMagicLink: any, updateManyCount = 1) {
      mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          magicLink: {
            findUnique: jest.fn().mockResolvedValue(mockMagicLink),
            updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
          },
        };
        return cb(tx);
      });
    }

    it('should throw UnauthorizedException if token not found', async () => {
      mockTransaction(null);

      await expect(service.validateMagicLink('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );

      mockTransaction(null);
      await expect(service.validateMagicLink('invalid-token')).rejects.toThrow(
        'Invalid or expired magic link',
      );
    });

    it('should throw UnauthorizedException if token expired', async () => {
      mockTransaction({
        expiresAt: new Date(Date.now() - 1000),
        used: false,
        user: { id: 'user-1', email: 'test@example.com', role: 'EMPLOYEE' },
      });

      await expect(service.validateMagicLink('expired-token')).rejects.toThrow(
        'Invalid or expired magic link',
      );
    });

    it('should throw UnauthorizedException if token already used', async () => {
      mockTransaction({
        expiresAt: new Date(Date.now() + 100000),
        used: true,
        user: { id: 'user-1', email: 'test@example.com', role: 'EMPLOYEE' },
      });

      await expect(service.validateMagicLink('used-token')).rejects.toThrow(
        'Invalid or expired magic link',
      );
    });

    it('should use single error message for all invalid cases (timing attack prevention)', async () => {
      const errorMessage = 'Invalid or expired magic link';

      // Not found
      mockTransaction(null);
      await expect(service.validateMagicLink('a')).rejects.toThrow(errorMessage);

      // Expired
      mockTransaction({
        expiresAt: new Date(Date.now() - 1000),
        used: false,
        user: {},
      });
      await expect(service.validateMagicLink('b')).rejects.toThrow(errorMessage);

      // Used
      mockTransaction({
        expiresAt: new Date(Date.now() + 100000),
        used: true,
        user: {},
      });
      await expect(service.validateMagicLink('c')).rejects.toThrow(errorMessage);
    });

    it('should return tokens with refresh_token if token is valid', async () => {
      const rawToken = 'valid-token';

      const mockMagicLink = {
        expiresAt: new Date(Date.now() + 100000),
        used: false,
        user: { id: 'user-1', email: 'test@example.com', role: 'EMPLOYEE', clinicId: 'clinic-1' },
      };
      mockTransaction(mockMagicLink, 1);

      const result = await service.validateMagicLink(rawToken);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
      expect(result.user).not.toHaveProperty('password');
    });

    it('should throw if optimistic lock fails (race condition)', async () => {
      const mockMagicLink = {
        expiresAt: new Date(Date.now() + 100000),
        used: false,
        user: { id: 'user-1', email: 'test@example.com', role: 'EMPLOYEE', clinicId: 'clinic-1' },
      };
      mockTransaction(mockMagicLink, 0);

      await expect(service.validateMagicLink('race-token')).rejects.toThrow(
        'Invalid or expired magic link',
      );
    });

    it('should trigger cleanup of expired magic links after successful validation', async () => {
      const mockMagicLink = {
        expiresAt: new Date(Date.now() + 100000),
        used: false,
        user: { id: 'user-1', email: 'test@example.com', role: 'EMPLOYEE', clinicId: 'clinic-1' },
      };
      mockTransaction(mockMagicLink, 1);

      await service.validateMagicLink('valid-token');

      // Wait for the background cleanup promise to execute
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockPrismaService.magicLink.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ expiresAt: expect.any(Object) }),
              expect.objectContaining({ used: true }),
            ]),
          }),
        }),
      );
    });
  });

  describe('refreshToken', () => {
    it('should return new tokens for valid refresh token', async () => {
      const mockPayload = { sub: 'user-1', email: 'test@example.com', role: 'ADMIN', clinicId: 'clinic-1' };
      const mockUser = { id: 'user-1', email: 'test@example.com', role: 'ADMIN', clinicId: 'clinic-1' };

      mockJwtService.verify.mockReturnValue(mockPayload);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.refreshToken('valid-refresh-token');

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-refresh-token');
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
    });

    it('should throw UnauthorizedException if token verification fails', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshToken('expired-token')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should throw UnauthorizedException if user no longer exists', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'deleted-user' });
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.refreshToken('orphan-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });
  });
});
