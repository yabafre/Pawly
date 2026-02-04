import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '@/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '@/modules/mail/mail.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

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
    const clinicId = '00000000-0000-0000-0000-000000000001';

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
      clinicId: '00000000-0000-0000-0000-000000000001',
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

    it('should include clinicId in JWT payload', async () => {
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
        expect.objectContaining({ clinicId: loginDto.clinicId }),
      );
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

    it('should create user with hashed password and return without password', async () => {
      const mockCreatedUser = {
        id: 'user-new',
        email: registerDto.email,
        password: 'hashed-password',
        clinicId: 'temp-clinic-id',
        employee: {
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          jobType: registerDto.jobType,
        },
      };
      mockPrismaService.user.create.mockResolvedValue(mockCreatedUser);

      const result = await service.register(registerDto);

      expect(result).not.toHaveProperty('password');
      expect(result).toHaveProperty('email', registerDto.email);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: registerDto.email,
            password: expect.any(String), // bcrypt hash
          }),
        }),
      );
      // Verify password was hashed (not stored in plain text)
      const callArgs = mockPrismaService.user.create.mock.calls[0][0];
      expect(callArgs.data.password).not.toBe(registerDto.password);
    });
  });

  describe('requestMagicLink', () => {
    it('should return success message if user not found (prevent enumeration)', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      const result = await service.requestMagicLink(
        'nonexistent@example.com',
        '00000000-0000-0000-0000-000000000001',
      );

      expect(result).toEqual({ message: 'If an account exists, a magic link has been sent' });
      expect(mockMailService.sendMagicLink).not.toHaveBeenCalled();
    });

    it('should create a magic link and send an email if user exists', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        clinicId: '00000000-0000-0000-0000-000000000001',
      };
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockImplementation(({ data }) => Promise.resolve(data));

      const result = await service.requestMagicLink(
        'test@example.com',
        '00000000-0000-0000-0000-000000000001',
      );

      expect(prisma.magicLink.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          clinicId: '00000000-0000-0000-0000-000000000001',
          token: expect.any(String),
        }),
      }));

      expect(mailService.sendMagicLink).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringMatching(/token=[a-f0-9]{64}/),
      );
      expect(result).toEqual({ message: 'If an account exists, a magic link has been sent' });
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
        'Invalid or expired refresh token',
      );
    });
  });
});
