import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthResponse = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    user: { id: 'user-1', email: 'test@example.com', role: 'ADMIN', clinicId: 'clinic-1' },
  };

  const mockAuthService = {
    login: jest.fn().mockResolvedValue(mockAuthResponse),
    register: jest.fn().mockResolvedValue({ id: 'user-new', email: 'new@example.com' }),
    requestMagicLink: jest.fn().mockResolvedValue({ message: 'If an account exists, a magic link has been sent' }),
    validateMagicLink: jest.fn().mockResolvedValue(mockAuthResponse),
    refreshToken: jest.fn().mockResolvedValue(mockAuthResponse),
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
      const loginDto = { email: 'test@example.com', password: 'Password1', clinicId: 'clinic-1' };

      const result = await controller.login(loginDto);

      expect(service.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual(mockAuthResponse);
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('user');
    });
  });

  describe('register', () => {
    it('should call authService.register and return created user', async () => {
      const registerDto = {
        email: 'new@example.com',
        password: 'Password1',
        firstName: 'John',
        lastName: 'Doe',
        jobType: 'VET' as const,
      };

      const result = await controller.register(registerDto);

      expect(service.register).toHaveBeenCalledWith(registerDto);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email', 'new@example.com');
    });
  });

  describe('requestMagicLink', () => {
    it('should call authService.requestMagicLink and return message', async () => {
      const email = 'test@example.com';
      const clinicId = '00000000-0000-0000-0000-000000000001';

      const result = await controller.requestMagicLink({ email, clinicId });

      expect(service.requestMagicLink).toHaveBeenCalledWith(email, clinicId);
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
  });

  describe('refresh', () => {
    it('should call authService.refreshToken and return new tokens', async () => {
      const refreshTokenDto = { refresh_token: 'valid-refresh-token' };

      const result = await controller.refresh(refreshTokenDto);

      expect(service.refreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(result).toEqual(mockAuthResponse);
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
