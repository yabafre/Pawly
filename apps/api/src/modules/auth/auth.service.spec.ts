import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '@/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '@/modules/mail/mail.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let mailService: MailService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    magicLink: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    activationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    otpCode: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
  };

  const mockMailService = {
    sendMagicLink: jest.fn().mockResolvedValue(undefined),
    sendActivationEmail: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendOtpCode: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        WEB_APP_URL: 'http://localhost:3000',
        JWT_SECRET: 'test-secret-minimum-32-characters-long!!',
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
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.validateUser(email, password);

      expect(result).toEqual({
        id: 'user-1',
        email,
        role: 'EMPLOYEE',
        clinicId,
      });
      expect(result).not.toHaveProperty('password');
    });

    it('should return null if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
    });

    it('should return null if password does not match', async () => {
      const hashedPassword = await bcrypt.hash('DifferentPassword1', 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email,
        password: hashedPassword,
        role: 'EMPLOYEE',
        clinicId,
      });

      const result = await service.validateUser(email, 'WrongPassword1');

      expect(result).toBeNull();
    });

    it('should return null if user has no password set', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email,
        password: null,
        role: 'EMPLOYEE',
        clinicId,
      });

      const result = await service.validateUser(email, password);

      expect(result).toBeNull();
    });

    it('should not short-circuit when user not found (timing attack prevention)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const start = Date.now();
      const result = await service.validateUser(email, password);
      const elapsed = Date.now() - start;

      expect(result).toBeNull();
      // bcrypt.compare should run even for non-existent users (~50-200ms).
      // If the function short-circuited, it would return in <5ms.
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password1',
    };
    const clinicId = '00000000-0000-4000-8000-000000000001';

    it('should return tokens and user on successful login', async () => {
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      const mockUser = {
        id: 'user-1',
        email: loginDto.email,
        password: hashedPassword,
        role: 'ADMIN',
        clinicId,
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
      expect(result.user).not.toHaveProperty('password');
      expect(mockJwtService.sign).toHaveBeenCalledTimes(1); // access only (refresh is opaque)
    });

    it('should include all required fields in JWT payload', async () => {
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        password: hashedPassword,
        role: 'ADMIN',
        clinicId,
      });

      await service.login(loginDto);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          email: loginDto.email,
          sub: 'user-1',
          role: 'ADMIN',
          clinicId,
        }),
      );
    });

    it('should store refresh token hash in DB with 7d expiry (NFR8)', async () => {
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        password: hashedPassword,
        role: 'ADMIN',
        clinicId,
      });

      await service.login(loginDto);

      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tokenHash: expect.any(String),
          family: expect.any(String),
          userId: 'user-1',
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('should generate access token without explicit expiresIn (uses module default 1d/24h - NFR8)', async () => {
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        password: hashedPassword,
        role: 'ADMIN',
        clinicId,
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
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('requestMagicLink', () => {
    it('should return success message if user not found (prevent enumeration)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.requestMagicLink('nonexistent@example.com');

      expect(result).toEqual({ message: 'If an account exists, a magic link has been sent' });
      expect(mockMailService.sendMagicLink).not.toHaveBeenCalled();
    });

    it('should create a magic link and send an email if user exists', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        clinicId: '00000000-0000-4000-8000-000000000001',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockImplementation(({ data }) => Promise.resolve(data));

      const result = await service.requestMagicLink('test@example.com');

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
        'fr',
      );
      expect(result).toEqual({ message: 'If an account exists, a magic link has been sent' });
    });

    it('should store a SHA-256 hashed token, not the raw token (NFR5)', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        clinicId: 'clinic-1',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockImplementation(({ data }) => Promise.resolve(data));

      await service.requestMagicLink('test@example.com');

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
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockImplementation(({ data }) => Promise.resolve(data));

      const beforeCreate = Date.now();
      await service.requestMagicLink('test@example.com');
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
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      const result1 = await service.requestMagicLink('no@example.com');

      // Existing user
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'yes@example.com',
        clinicId: 'clinic-1',
      });
      mockPrismaService.magicLink.create.mockResolvedValue({});
      const result2 = await service.requestMagicLink('yes@example.com');

      expect(result1.message).toBe(result2.message);
    });

    it('should enforce minimum response time for non-existent user (timing attack prevention)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const start = Date.now();
      await service.requestMagicLink('nonexistent@example.com');
      const elapsed = Date.now() - start;

      // delayToMinimumResponse enforces 300ms floor to prevent user enumeration via timing
      expect(elapsed).toBeGreaterThanOrEqual(250); // slight tolerance for CI jitter
      expect(mockMailService.sendMagicLink).not.toHaveBeenCalled();
    });

    it('should throw if email sending fails', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        clinicId: 'clinic-1',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockResolvedValue({});
      mockMailService.sendMagicLink.mockRejectedValueOnce(new Error('Resend API error'));

      await expect(
        service.requestMagicLink('test@example.com'),
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

  describe('createWelcomeMagicLink', () => {
    const email = 'employee@clinic.fr';
    const clinicId = '00000000-0000-4000-8000-000000000001';

    it('should create a magic link with 24h validity and return callback URL', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email,
        clinicId,
      });
      mockPrismaService.magicLink.create.mockResolvedValue({});

      const result = await service.createWelcomeMagicLink(email);

      expect(result).toMatch(/^http:\/\/localhost:3000\/auth\/callback\?token=[a-f0-9]{64}$/);
      expect(mockPrismaService.magicLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          clinicId,
          token: expect.any(String),
        }),
      });

      // Verify 24h TTL (not 15 minutes)
      const createCall = mockPrismaService.magicLink.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      const minExpected = Date.now() + 23 * 60 * 60 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(minExpected);
    });

    it('should return null when user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.createWelcomeMagicLink(email);

      expect(result).toBeNull();
      expect(mockPrismaService.magicLink.create).not.toHaveBeenCalled();
    });

    it('should use /auth/callback route (not /auth/activate)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email,
        clinicId,
      });
      mockPrismaService.magicLink.create.mockResolvedValue({});

      const result = await service.createWelcomeMagicLink(email);

      expect(result).toContain('/auth/callback?token=');
      expect(result).not.toContain('/auth/activate');
    });
  });

  describe('createActivationTokenAndGetUrl', () => {
    const email = 'test@example.com';
    const clinicId = '00000000-0000-4000-8000-000000000001';

    it('should return activation URL when user exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email,
        clinicId,
      });
      mockPrismaService.activationToken.create.mockResolvedValue({});

      const result = await service.createActivationTokenAndGetUrl(email);

      expect(result).toMatch(/^http:\/\/localhost:3000\/auth\/activate\?token=[a-f0-9]{64}$/);
      expect(mockPrismaService.activationToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          clinicId,
          token: expect.any(String),
        }),
      });
    });

    it('should return null when user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.createActivationTokenAndGetUrl(email);

      expect(result).toBeNull();
      expect(mockPrismaService.activationToken.create).not.toHaveBeenCalled();
    });
  });

  describe('createActivationToken', () => {
    const email = 'doctor@clinic.fr';
    const clinicId = '00000000-0000-4000-8000-000000000001';

    it('should create token and send activation email with admin name', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email,
        clinicId,
      });
      mockPrismaService.activationToken.create.mockResolvedValue({});

      await service.createActivationToken(email, 'Dr. Dupont');

      expect(mockMailService.sendActivationEmail).toHaveBeenCalledWith(
        email,
        expect.stringMatching(/token=[a-f0-9]{64}/),
        'Dr. Dupont',
      );
    });

    it('should return generic message when user does not exist (prevent enumeration)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.createActivationToken(email);

      expect(result).toEqual({
        message: 'If an account exists, an activation email has been sent',
      });
      expect(mockMailService.sendActivationEmail).not.toHaveBeenCalled();
    });
  });

  describe('requestOtp', () => {
    const email = 'employee@clinic.fr';
    const clinicId = '00000000-0000-4000-8000-000000000001';
    const mockUser = {
      id: 'user-1',
      email,
      clinicId,
      otpFallbackUntil: null,
    };

    it('should create OTP code with HMAC hash and send email when user exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.otpCode.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.otpCode.create.mockResolvedValue({});

      const result = await service.requestOtp(email);

      expect(result).toEqual({ method: 'otp', message: 'If account exists, code sent' });
      expect(mockPrismaService.otpCode.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', used: false },
        data: { used: true },
      });
      expect(mockPrismaService.otpCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: expect.any(String),
          userId: 'user-1',
          clinicId,
        }),
      });
      expect(mockMailService.sendOtpCode).toHaveBeenCalledWith(email, expect.stringMatching(/^\d{6}$/), 'fr');
    });

    it('should return same response when user does not exist (prevent enumeration)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.requestOtp('nonexistent@example.com');

      expect(result).toEqual({ method: 'otp', message: 'If account exists, code sent' });
      expect(mockMailService.sendOtpCode).not.toHaveBeenCalled();
    });

    it('should enforce minimum response time for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const start = Date.now();
      await service.requestOtp('nonexistent@example.com');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(250);
    });

    it('should fallback to magic link when otpFallbackUntil is in the future', async () => {
      const fallbackUser = {
        ...mockUser,
        otpFallbackUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockPrismaService.user.findUnique.mockResolvedValue(fallbackUser);
      mockPrismaService.magicLink.create.mockResolvedValue({});

      const result = await service.requestOtp(email);

      expect(result).toEqual({ method: 'magic_link', message: 'If account exists, link sent' });
      expect(mockMailService.sendMagicLink).toHaveBeenCalled();
      expect(mockMailService.sendOtpCode).not.toHaveBeenCalled();
    });

    it('should NOT fallback when otpFallbackUntil is in the past', async () => {
      const expiredFallbackUser = {
        ...mockUser,
        otpFallbackUntil: new Date(Date.now() - 1000),
      };
      mockPrismaService.user.findUnique.mockResolvedValue(expiredFallbackUser);
      mockPrismaService.otpCode.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.otpCode.create.mockResolvedValue({});

      const result = await service.requestOtp(email);

      expect(result).toEqual({ method: 'otp', message: 'If account exists, code sent' });
      expect(mockMailService.sendOtpCode).toHaveBeenCalled();
    });

    it('should invalidate existing unused OTPs before creating new one', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.otpCode.updateMany.mockResolvedValue({ count: 2 });
      mockPrismaService.otpCode.create.mockResolvedValue({});

      await service.requestOtp(email);

      const updateCall = mockPrismaService.otpCode.updateMany.mock.calls[0];
      expect(updateCall[0]).toEqual({
        where: { userId: 'user-1', used: false },
        data: { used: true },
      });
    });

    it('should store HMAC-SHA256 hash, not raw code', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.otpCode.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.otpCode.create.mockResolvedValue({});

      await service.requestOtp(email);

      const createCall = mockPrismaService.otpCode.create.mock.calls[0][0];
      const storedCode = createCall.data.code;
      // HMAC-SHA256 produces a 64-char hex string
      expect(storedCode).toMatch(/^[a-f0-9]{64}$/);

      // Raw code sent to mail should be 6 digits
      const rawCode = mockMailService.sendOtpCode.mock.calls[0][1];
      expect(rawCode).toMatch(/^\d{6}$/);

      // Stored hash should differ from raw code
      expect(storedCode).not.toBe(rawCode);
    });

    it('should set OTP TTL to 5 minutes', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.otpCode.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.otpCode.create.mockResolvedValue({});

      const before = Date.now();
      await service.requestOtp(email);
      const after = Date.now();

      const createCall = mockPrismaService.otpCode.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt as Date;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 4 * 60 * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + 6 * 60 * 1000);
    });
  });

  describe('verifyOtp', () => {
    const email = 'employee@clinic.fr';

    function mockOtpTransaction(
      user: any,
      otpCode: any,
      otpUpdateCount = 1,
      userUpdateFn?: jest.Mock,
    ) {
      mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          user: {
            findUnique: jest.fn().mockResolvedValue(user),
            update: userUpdateFn ?? jest.fn().mockResolvedValue(user),
          },
          otpCode: {
            findFirst: jest.fn().mockResolvedValue(otpCode),
            updateMany: jest.fn().mockResolvedValue({ count: otpUpdateCount }),
          },
        };
        return cb(tx);
      });
    }

    it('should return tokens when code is valid', async () => {
      const secret = 'test-secret-minimum-32-characters-long!!';
      const rawCode = '428715';
      const hashedCode = crypto.createHmac('sha256', secret).update(rawCode).digest('hex');

      const user = { id: 'user-1', email, role: 'EMPLOYEE', clinicId: 'clinic-1' };
      const otpCode = {
        id: 'otp-1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 300000),
        used: false,
        attempts: 0,
      };

      mockOtpTransaction(user, otpCode);

      const result = await service.verifyOtp(email, rawCode);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
    });

    it('should throw when user not found', async () => {
      mockOtpTransaction(null, null);

      await expect(service.verifyOtp(email, '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when no valid OTP exists', async () => {
      const user = { id: 'user-1', email };
      mockOtpTransaction(user, null);

      await expect(service.verifyOtp(email, '123456')).rejects.toThrow(
        'Invalid or expired code',
      );
    });

    it('should throw and increment attempts when code is wrong', async () => {
      const secret = 'test-secret-minimum-32-characters-long!!';
      const correctHash = crypto.createHmac('sha256', secret).update('428715').digest('hex');

      const user = { id: 'user-1', email, role: 'EMPLOYEE', clinicId: 'clinic-1' };
      const otpCode = {
        id: 'otp-1',
        code: correctHash,
        expiresAt: new Date(Date.now() + 300000),
        used: false,
        attempts: 0,
      };

      mockOtpTransaction(user, otpCode);

      await expect(service.verifyOtp(email, '999999')).rejects.toThrow('Invalid code');
    });

    it('should set otpFallbackUntil when max attempts reached', async () => {
      const user = { id: 'user-1', email, role: 'EMPLOYEE', clinicId: 'clinic-1' };
      const otpCode = {
        id: 'otp-1',
        code: 'some-hash',
        expiresAt: new Date(Date.now() + 300000),
        used: false,
        attempts: 5,
      };

      const userUpdateFn = jest.fn().mockResolvedValue(user);
      mockOtpTransaction(user, otpCode, 1, userUpdateFn);

      await expect(service.verifyOtp(email, '123456')).rejects.toThrow(
        'Too many attempts. Check email for login link.',
      );
    });

    it('should set fallback when wrong code reaches max attempts', async () => {
      const secret = 'test-secret-minimum-32-characters-long!!';
      const correctHash = crypto.createHmac('sha256', secret).update('428715').digest('hex');

      const user = { id: 'user-1', email, role: 'EMPLOYEE', clinicId: 'clinic-1' };
      const otpCode = {
        id: 'otp-1',
        code: correctHash,
        expiresAt: new Date(Date.now() + 300000),
        used: false,
        attempts: 4, // will become 5 after increment
      };

      mockOtpTransaction(user, otpCode);

      await expect(service.verifyOtp(email, '999999')).rejects.toThrow(
        'Too many attempts. Check email for login link.',
      );
    });

    it('should throw when optimistic lock fails (race condition)', async () => {
      const secret = 'test-secret-minimum-32-characters-long!!';
      const rawCode = '428715';
      const hashedCode = crypto.createHmac('sha256', secret).update(rawCode).digest('hex');

      const user = { id: 'user-1', email, role: 'EMPLOYEE', clinicId: 'clinic-1' };
      const otpCode = {
        id: 'otp-1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 300000),
        used: false,
        attempts: 0,
      };

      // updateMany returns 0 = optimistic lock failure
      mockOtpTransaction(user, otpCode, 0);

      await expect(service.verifyOtp(email, rawCode)).rejects.toThrow('Invalid code');
    });

    it('should enforce minimum 300ms response time for null user path', async () => {
      mockOtpTransaction(null, null);

      const start = Date.now();
      try {
        await service.verifyOtp(email, '123456');
      } catch {
        // expected
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(250);
    });

    it('should enforce minimum 300ms response time for wrong code path (timing attack prevention)', async () => {
      const secret = 'test-secret-minimum-32-characters-long!!';
      const correctHash = crypto.createHmac('sha256', secret).update('428715').digest('hex');

      const user = { id: 'user-1', email, role: 'EMPLOYEE', clinicId: 'clinic-1' };
      const otpCode = {
        id: 'otp-1',
        code: correctHash,
        expiresAt: new Date(Date.now() + 300000),
        used: false,
        attempts: 0,
      };

      mockOtpTransaction(user, otpCode);

      const start = Date.now();
      try {
        await service.verifyOtp(email, '999999');
      } catch {
        // expected
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(250);
    });

    it('should enforce minimum 300ms response time for max attempts path (timing attack prevention)', async () => {
      const user = { id: 'user-1', email, role: 'EMPLOYEE', clinicId: 'clinic-1' };
      const otpCode = {
        id: 'otp-1',
        code: 'some-hash',
        expiresAt: new Date(Date.now() + 300000),
        used: false,
        attempts: 5,
      };

      const userUpdateFn = jest.fn().mockResolvedValue(user);
      mockOtpTransaction(user, otpCode, 1, userUpdateFn);

      const start = Date.now();
      try {
        await service.verifyOtp(email, '123456');
      } catch {
        // expected
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(250);
    });

    it('should trigger cleanup of expired OTP codes in background', async () => {
      const secret = 'test-secret-minimum-32-characters-long!!';
      const rawCode = '428715';
      const hashedCode = crypto.createHmac('sha256', secret).update(rawCode).digest('hex');

      const user = { id: 'user-1', email, role: 'EMPLOYEE', clinicId: 'clinic-1' };
      const otpCode = {
        id: 'otp-1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 300000),
        used: false,
        attempts: 0,
      };

      mockOtpTransaction(user, otpCode);

      await service.verifyOtp(email, rawCode);
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockPrismaService.otpCode.deleteMany).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    const mockUser = { id: 'user-1', email: 'test@example.com', role: 'ADMIN', clinicId: 'clinic-1' };

    it('should return new tokens for valid refresh token', async () => {
      const rawToken = 'valid-refresh-token';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        tokenHash,
        family: 'family-1',
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        userId: 'user-1',
        user: mockUser,
      });
      mockPrismaService.refreshToken.update.mockResolvedValue({});

      const result = await service.refreshToken(rawToken);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
      // Old token should be revoked
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should throw UnauthorizedException if token not found in DB', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('unknown-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should revoke entire family on reuse detection', async () => {
      const rawToken = 'reused-token';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        tokenHash,
        family: 'family-1',
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: new Date(), // Already revoked = reuse
        userId: 'user-1',
        user: mockUser,
      });

      await expect(service.refreshToken(rawToken)).rejects.toThrow(
        'Refresh token reuse detected',
      );
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { family: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should throw UnauthorizedException if token expired', async () => {
      const rawToken = 'expired-token';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        tokenHash,
        family: 'family-1',
        expiresAt: new Date(Date.now() - 86400000), // Expired
        revokedAt: null,
        userId: 'user-1',
        user: mockUser,
      });

      await expect(service.refreshToken(rawToken)).rejects.toThrow(
        'Refresh token expired',
      );
    });
  });

  describe('registerAdmin', () => {
    const registerInput = {
      clinicName: 'Clinique du Parc',
      adminName: 'Dr. Martin',
      email: 'admin@clinic.com',
      password: 'Password1',
    };

    const mockClinic = { id: 'clinic-1', name: 'Clinique du Parc', slug: 'clinique-du-parc-abc' };
    const mockUser = {
      id: 'user-1',
      email: 'admin@clinic.com',
      name: 'Dr. Martin',
      role: 'ADMIN',
      clinicId: 'clinic-1',
      password: 'hashed',
      locale: 'fr',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should create clinic, user, and subscription atomically', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          clinic: { create: jest.fn().mockResolvedValue(mockClinic) },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
          subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
        };
        return cb(tx);
      });

      const result = await service.registerAdmin(registerInput);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe('admin@clinic.com');
    });

    it('should throw if email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.registerAdmin(registerInput)).rejects.toThrow(UnauthorizedException);
    });

    it('should hash password with bcrypt 12 rounds', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      let capturedPassword = '';
      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          clinic: { create: jest.fn().mockResolvedValue(mockClinic) },
          user: {
            create: jest.fn().mockImplementation(({ data }) => {
              capturedPassword = data.password;
              return mockUser;
            }),
          },
          subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
        };
        return cb(tx);
      });

      await service.registerAdmin(registerInput);

      expect(capturedPassword).not.toBe('Password1');
      expect(capturedPassword.startsWith('$2b$12$')).toBe(true);
    });

    it('should create subscription with starter tier', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      let capturedSubData: Record<string, unknown> = {};
      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          clinic: { create: jest.fn().mockResolvedValue(mockClinic) },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
          subscription: {
            create: jest.fn().mockImplementation(({ data }) => {
              capturedSubData = data;
              return { id: 'sub-1' };
            }),
          },
        };
        return cb(tx);
      });

      await service.registerAdmin(registerInput);

      expect(capturedSubData.planKey).toBe('starter_free');
      expect(capturedSubData.entitlementTier).toBe('starter');
      expect(capturedSubData.status).toBe('active');
    });

    it('should send welcome email fire-and-forget', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockMailService.sendWelcomeEmail = jest.fn().mockResolvedValue(undefined);
      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          clinic: { create: jest.fn().mockResolvedValue(mockClinic) },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
          subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
        };
        return cb(tx);
      });

      await service.registerAdmin(registerInput);

      expect(mockMailService.sendWelcomeEmail).toHaveBeenCalledWith(
        'admin@clinic.com',
        'Dr. Martin',
        'fr',
      );
    });

    it('should set clinic onboardingCompleted to false', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      let capturedClinicData: Record<string, unknown> = {};
      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          clinic: {
            create: jest.fn().mockImplementation(({ data }) => {
              capturedClinicData = data;
              return mockClinic;
            }),
          },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
          subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
        };
        return cb(tx);
      });

      await service.registerAdmin(registerInput);

      expect(capturedClinicData.onboardingCompleted).toBe(false);
    });

    it('should create user with ADMIN role', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      let capturedUserData: Record<string, unknown> = {};
      mockPrismaService.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          clinic: { create: jest.fn().mockResolvedValue(mockClinic) },
          user: {
            create: jest.fn().mockImplementation(({ data }) => {
              capturedUserData = data;
              return mockUser;
            }),
          },
          subscription: { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
        };
        return cb(tx);
      });

      await service.registerAdmin(registerInput);

      expect(capturedUserData.role).toBe('ADMIN');
    });
  });
});
