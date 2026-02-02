import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let mailService: MailService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    magicLink: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
  };

  const mockMailService = {
    sendMagicLink: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    mailService = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestMagicLink', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.requestMagicLink('nonexistent@example.com')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should create a magic link and send an email if user exists', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', clinicId: 'clinic-1' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.magicLink.create.mockImplementation(({ data }) => Promise.resolve(data));

      const result = await service.requestMagicLink('test@example.com');
      
      expect(prisma.magicLink.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          clinicId: 'clinic-1',
          token: expect.any(String),
        }),
      }));
      
      const hashedTokenInDb = (prisma.magicLink.create as jest.Mock).mock.calls[0][0].data.token;

      expect(mailService.sendMagicLink).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringMatching(/token=[a-f0-9]{64}/),
      );
      expect(result).toEqual({ message: 'Magic link sent' });
    });
  });

  describe('validateMagicLink', () => {
    it('should throw UnauthorizedException if token not found', async () => {
      mockPrismaService.magicLink.findUnique.mockResolvedValue(null);
      await expect(service.validateMagicLink('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if token expired', async () => {
      mockPrismaService.magicLink.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() - 1000),
        used: false,
      });
      await expect(service.validateMagicLink('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if token already used', async () => {
      mockPrismaService.magicLink.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 100000),
        used: true,
      });
      await expect(service.validateMagicLink('used-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return a JWT if token is valid', async () => {
      const mockMagicLink = {
        token: 'valid-token',
        expiresAt: new Date(Date.now() + 100000),
        used: false,
        user: { id: 'user-1', email: 'test@example.com', role: 'EMPLOYEE' },
      };
      mockPrismaService.magicLink.findUnique.mockResolvedValue(mockMagicLink);
      mockPrismaService.magicLink.update.mockResolvedValue({ ...mockMagicLink, used: true });

      const result = await service.validateMagicLink('valid-token');

      expect(prisma.magicLink.update).toHaveBeenCalledWith({
        where: { token: 'valid-token' },
        data: { used: true },
      });
      expect(result).toHaveProperty('access_token', 'mock-token');
    });
  });
});
