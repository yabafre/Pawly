import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthResponse = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    user: { id: 'user-1', email: 'test@example.com', role: 'ADMIN', clinicId: 'clinic-1' },
  };

  const mockOtpResponse = { method: 'otp' as const, message: 'If account exists, code sent' };

  const mockAuthService = {
    login: jest.fn().mockResolvedValue(mockAuthResponse),
    requestMagicLink: jest.fn().mockResolvedValue({ message: 'If an account exists, a magic link has been sent' }),
    validateMagicLink: jest.fn().mockResolvedValue(mockAuthResponse),
    refreshToken: jest.fn().mockResolvedValue(mockAuthResponse),
    requestOtp: jest.fn().mockResolvedValue(mockOtpResponse),
    verifyOtp: jest.fn().mockResolvedValue(mockAuthResponse),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should call authService.login and return tokens', async () => {
      const loginDto = { email: 'test@example.com', password: 'Password1' };

      const result = await controller.login(loginDto);

      expect(service.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual(mockAuthResponse);
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
    });

    it('should propagate UnauthorizedException from service', async () => {
      mockAuthService.login.mockRejectedValueOnce(new UnauthorizedException('Invalid credentials'));
      const loginDto = { email: 'test@example.com', password: 'wrong' };

      await expect(controller.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('requestMagicLink', () => {
    it('should call authService.requestMagicLink and return message', async () => {
      const email = 'test@example.com';

      const result = await controller.requestMagicLink({ email });

      expect(service.requestMagicLink).toHaveBeenCalledWith(email);
      expect(result).toEqual({ message: 'If an account exists, a magic link has been sent' });
    });
  });

  describe('validateMagicLink', () => {
    it('should call authService.validateMagicLink with token from query DTO', async () => {
      const query = { token: 'a'.repeat(64) };

      const result = await controller.validateMagicLink(query as any);

      expect(service.validateMagicLink).toHaveBeenCalledWith(query.token);
      expect(result).toEqual(mockAuthResponse);
    });

    it('should propagate UnauthorizedException for invalid token', async () => {
      mockAuthService.validateMagicLink.mockRejectedValueOnce(
        new UnauthorizedException('Invalid or expired magic link'),
      );

      await expect(controller.validateMagicLink({ token: 'bad' } as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('should call authService.refreshToken and return new tokens', async () => {
      const refreshTokenDto = { refresh_token: 'valid-refresh-token' };

      const result = await controller.refresh(refreshTokenDto);

      expect(service.refreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(result).toEqual(mockAuthResponse);
    });

    it('should propagate UnauthorizedException for expired refresh token', async () => {
      mockAuthService.refreshToken.mockRejectedValueOnce(
        new UnauthorizedException('Invalid or expired refresh token'),
      );

      await expect(controller.refresh({ refresh_token: 'expired' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('requestOtp', () => {
    it('should call authService.requestOtp and return response', async () => {
      const result = await controller.requestOtp({ email: 'user@example.com' });

      expect(service.requestOtp).toHaveBeenCalledWith('user@example.com');
      expect(result).toEqual(mockOtpResponse);
    });

    it('should propagate errors from service', async () => {
      mockAuthService.requestOtp.mockRejectedValueOnce(new Error('Send failed'));

      await expect(controller.requestOtp({ email: 'user@example.com' })).rejects.toThrow('Send failed');
    });
  });

  describe('verifyOtp', () => {
    it('should call authService.verifyOtp and return tokens', async () => {
      const result = await controller.verifyOtp({ email: 'user@example.com', code: '428715' });

      expect(service.verifyOtp).toHaveBeenCalledWith('user@example.com', '428715');
      expect(result).toEqual(mockAuthResponse);
    });

    it('should propagate UnauthorizedException for invalid code', async () => {
      mockAuthService.verifyOtp.mockRejectedValueOnce(
        new UnauthorizedException('Invalid code'),
      );

      await expect(controller.verifyOtp({ email: 'user@example.com', code: '000000' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getProfile', () => {
    it('should return the user object', () => {
      const mockUser = { userId: 'user-1', email: 'test@example.com', role: 'ADMIN', clinicId: 'clinic-1' };

      const result = controller.getProfile(mockUser);

      expect(result).toEqual(mockUser);
    });
  });
});
