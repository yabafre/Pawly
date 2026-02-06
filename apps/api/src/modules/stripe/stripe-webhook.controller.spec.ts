import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;

  const mockStripeService = {
    constructWebhookEvent: jest.fn(),
    isEventProcessed: jest.fn(),
    markEventProcessed: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: StripeService, useValue: mockStripeService },
      ],
    }).compile();

    controller = module.get<StripeWebhookController>(StripeWebhookController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  function createMockRequest(
    rawBody?: Buffer,
  ): RawBodyRequest<Request> {
    return { rawBody } as RawBodyRequest<Request>;
  }

  describe('handleWebhook', () => {
    const validSignature = 'test-signature';
    const mockEvent = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123' } },
    };

    it('should return { received: true } on successful webhook processing', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      mockStripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      mockStripeService.isEventProcessed.mockResolvedValue(false);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockStripeService.constructWebhookEvent).toHaveBeenCalledWith(
        req.rawBody,
        validSignature,
      );
      expect(mockStripeService.isEventProcessed).toHaveBeenCalledWith(
        'evt_test_123',
      );
      expect(mockStripeService.markEventProcessed).toHaveBeenCalledWith(
        'evt_test_123',
        'checkout.session.completed',
      );
    });

    it('should throw BadRequestException when raw body is missing', async () => {
      const req = createMockRequest(undefined);

      await expect(
        controller.handleWebhook(req, validSignature),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.handleWebhook(req, validSignature),
      ).rejects.toThrow('Missing raw body');
    });

    it('should throw BadRequestException when stripe-signature header is missing', async () => {
      const req = createMockRequest(Buffer.from('payload'));

      await expect(
        controller.handleWebhook(req, undefined as unknown as string),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.handleWebhook(req, undefined as unknown as string),
      ).rejects.toThrow('Missing stripe-signature header');
    });

    it('should throw BadRequestException when signature verification fails', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      mockStripeService.constructWebhookEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        controller.handleWebhook(req, 'invalid-sig'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.handleWebhook(req, 'invalid-sig'),
      ).rejects.toThrow('Webhook signature verification failed');
    });

    it('should return { received: true } for duplicate events (idempotent)', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      mockStripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      mockStripeService.isEventProcessed.mockResolvedValue(true);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockStripeService.markEventProcessed).not.toHaveBeenCalled();
    });

    it('should handle checkout.session.completed event', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_checkout',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_123' } },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.isEventProcessed.mockResolvedValue(false);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockStripeService.markEventProcessed).toHaveBeenCalledWith(
        'evt_checkout',
        'checkout.session.completed',
      );
    });

    it('should handle customer.subscription.updated event', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_sub_update',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_123' } },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.isEventProcessed.mockResolvedValue(false);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
    });

    it('should handle customer.subscription.deleted event', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_sub_delete',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_123' } },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.isEventProcessed.mockResolvedValue(false);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
    });

    it('should handle invoice.payment_failed event', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_invoice_fail',
        type: 'invoice.payment_failed',
        data: { object: { id: 'in_123' } },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.isEventProcessed.mockResolvedValue(false);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
    });

    it('should handle P2002 unique constraint violation gracefully (concurrent duplicate)', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      mockStripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      mockStripeService.isEventProcessed.mockResolvedValue(false);

      const p2002Error = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      mockStripeService.markEventProcessed.mockRejectedValue(p2002Error);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
    });

    it('should rethrow non-P2002 errors from markEventProcessed', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      mockStripeService.constructWebhookEvent.mockReturnValue(mockEvent);
      mockStripeService.isEventProcessed.mockResolvedValue(false);

      mockStripeService.markEventProcessed.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(
        controller.handleWebhook(req, validSignature),
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle unrecognized event types gracefully', async () => {
      const req = createMockRequest(Buffer.from('payload'));
      const event = {
        id: 'evt_unknown',
        type: 'some.unknown.event',
        data: { object: { id: 'obj_123' } },
      };
      mockStripeService.constructWebhookEvent.mockReturnValue(event);
      mockStripeService.isEventProcessed.mockResolvedValue(false);
      mockStripeService.markEventProcessed.mockResolvedValue(undefined);

      const result = await controller.handleWebhook(req, validSignature);

      expect(result).toEqual({ received: true });
      expect(mockStripeService.markEventProcessed).toHaveBeenCalledWith(
        'evt_unknown',
        'some.unknown.event',
      );
    });
  });
});
