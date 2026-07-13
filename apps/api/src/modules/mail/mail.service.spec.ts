jest.mock('@/trigger/client', () => ({
  sendEmailTask: { trigger: jest.fn() },
  batchEmailPublishTask: { trigger: jest.fn() },
  batchPushPublishTask: { trigger: jest.fn() },
}));
jest.mock('@react-email/render', () => ({
  render: jest.fn().mockResolvedValue('<html>mock</html>'),
}));
jest.mock('@/common/metrics', () => ({
  emailSendCounter: { add: jest.fn() },
  emailBatchSize: { record: jest.fn() },
}));
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn() },
    batch: { send: jest.fn() },
  })),
}));

import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { sendEmailTask } from '@/trigger/client';
import { emailSendCounter } from '@/common/metrics';
import type { EnvConfig } from '@/config/index';

const triggerMock = sendEmailTask.trigger as jest.Mock;
const counterMock = emailSendCounter.add as jest.Mock;

describe('MailService — Trigger.dev fallback for auth-critical emails', () => {
  let service: MailService;
  let resendSend: jest.Mock;

  const configService = {
    get: jest.fn().mockReturnValue('mock-value'),
  } as unknown as ConfigService<EnvConfig, true>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TRIGGER_SECRET_KEY = 'tr_test_key';
    service = new MailService(configService);
    resendSend = jest
      .fn()
      .mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });
    (service as unknown as { resend: unknown }).resend = {
      emails: { send: resendSend },
    };
  });

  afterEach(() => {
    delete process.env.TRIGGER_SECRET_KEY;
  });

  describe('sendMagicLink', () => {
    it('does not touch the direct Resend path when the Trigger dispatch succeeds', async () => {
      triggerMock.mockResolvedValue({ id: 'run-id' });

      await service.sendMagicLink('vet@clinic.fr', 'https://app/auth?token=x');

      expect(triggerMock).toHaveBeenCalledTimes(1);
      expect(resendSend).not.toHaveBeenCalled();
    });

    it('falls back to the direct Resend send when the Trigger dispatch fails', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));

      await service.sendMagicLink('vet@clinic.fr', 'https://app/auth?token=x');

      expect(resendSend).toHaveBeenCalledTimes(1);
      expect(resendSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'vet@clinic.fr' }),
      );
    });

    it('records a trigger_failure metric when the dispatch fails', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));

      await service.sendMagicLink('vet@clinic.fr', 'https://app/auth?token=x');

      expect(counterMock).toHaveBeenCalledWith(1, {
        type: 'magic-link',
        outcome: 'trigger_failure',
      });
    });

    it('throws when both the Trigger dispatch and the direct send fail — no silent path', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));
      resendSend.mockResolvedValue({
        data: null,
        error: { message: 'resend down' },
      });

      await expect(
        service.sendMagicLink('vet@clinic.fr', 'https://app/auth?token=x'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('sendOtpCode', () => {
    it('falls back to the direct Resend send when the Trigger dispatch fails', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));

      await service.sendOtpCode('vet@clinic.fr', '123456');

      expect(resendSend).toHaveBeenCalledTimes(1);
    });

    it('throws when both channels fail', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));
      resendSend.mockResolvedValue({
        data: null,
        error: { message: 'resend down' },
      });

      await expect(
        service.sendOtpCode('vet@clinic.fr', '123456'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('falls back to the direct Resend send when the Trigger dispatch fails', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));

      await service.sendPasswordResetEmail(
        'vet@clinic.fr',
        'https://app/reset?token=x',
      );

      expect(resendSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-critical emails keep log-only behavior', () => {
    it('sendWelcomeEmail neither falls back nor throws when the Trigger dispatch fails', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));

      await expect(
        service.sendWelcomeEmail('vet@clinic.fr', 'Sarah'),
      ).resolves.not.toThrow();

      expect(resendSend).not.toHaveBeenCalled();
    });
  });

  describe('sendScheduleChangedEmail — Story 11-4 reliable change notifications', () => {
    it('returns true and skips the direct send when the Trigger dispatch succeeds', async () => {
      triggerMock.mockResolvedValue({ id: 'run-id' });

      const ok = await service.sendScheduleChangedEmail(
        'vet@clinic.fr',
        'Sarah',
        '2026-07',
        'Clinique du Parc',
      );

      expect(ok).toBe(true);
      expect(resendSend).not.toHaveBeenCalled();
    });

    it('falls back to the direct Resend send when the Trigger dispatch fails', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));

      const ok = await service.sendScheduleChangedEmail(
        'vet@clinic.fr',
        'Sarah',
        '2026-07',
        'Clinique du Parc',
      );

      expect(ok).toBe(true);
      expect(resendSend).toHaveBeenCalledTimes(1);
      expect(counterMock).toHaveBeenCalledWith(1, {
        type: 'schedule_changed',
        outcome: 'success',
      });
    });

    it('returns false (does not throw) when both channels fail', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));
      resendSend.mockResolvedValue({
        data: null,
        error: { message: 'resend down' },
      });

      const ok = await service.sendScheduleChangedEmail(
        'vet@clinic.fr',
        'Sarah',
        '2026-07',
        'Clinique du Parc',
      );

      expect(ok).toBe(false);
      expect(counterMock).toHaveBeenCalledWith(1, {
        type: 'schedule_changed',
        outcome: 'failure',
      });
    });
  });

  describe('sendSchedulePublicationEmail — Story 11-4 reliable publication notifications', () => {
    it('returns true and skips the direct send when the Trigger dispatch succeeds', async () => {
      triggerMock.mockResolvedValue({ id: 'run-id' });

      const ok = await service.sendSchedulePublicationEmail(
        'vet@clinic.fr',
        'Sarah',
        '2026-07',
        'Clinique du Parc',
        5,
      );

      expect(ok).toBe(true);
      expect(resendSend).not.toHaveBeenCalled();
    });

    it('falls back to the direct Resend send when the Trigger dispatch fails', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));

      const ok = await service.sendSchedulePublicationEmail(
        'vet@clinic.fr',
        'Sarah',
        '2026-07',
        'Clinique du Parc',
        5,
      );

      expect(ok).toBe(true);
      expect(resendSend).toHaveBeenCalledTimes(1);
      expect(counterMock).toHaveBeenCalledWith(1, {
        type: 'schedule_publication',
        outcome: 'success',
      });
    });

    it('returns false (does not throw) when both channels fail', async () => {
      triggerMock.mockRejectedValue(new Error('trigger.dev unreachable'));
      resendSend.mockResolvedValue({
        data: null,
        error: { message: 'resend down' },
      });

      const ok = await service.sendSchedulePublicationEmail(
        'vet@clinic.fr',
        'Sarah',
        '2026-07',
        'Clinique du Parc',
        5,
      );

      expect(ok).toBe(false);
      expect(counterMock).toHaveBeenCalledWith(1, {
        type: 'schedule_publication',
        outcome: 'failure',
      });
    });
  });
});
