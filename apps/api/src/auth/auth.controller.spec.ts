import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthService = {
    requestMagicLink: jest.fn(),
    validateMagicLink: jest.fn(),
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestMagicLink', () => {
    it('should call authService.requestMagicLink', async () => {
      const email = 'test@example.com';
      await controller.requestMagicLink({ email });
      expect(service.requestMagicLink).toHaveBeenCalledWith(email);
    });
  });

  describe('validateMagicLink', () => {
    it('should call authService.validateMagicLink', async () => {
      const token = 'valid-token';
      await controller.validateMagicLink(token);
      expect(service.validateMagicLink).toHaveBeenCalledWith(token);
    });
  });
});
