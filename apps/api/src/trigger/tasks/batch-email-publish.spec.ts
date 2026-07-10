jest.mock('@trigger.dev/sdk', () => ({
  task: (config: unknown) => config,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const batchSend = jest.fn();
jest.mock('../lib/resend', () => ({
  getResend: () => ({ batch: { send: batchSend } }),
  mailFrom: 'Pawly <noreply@pawly.app>',
}));
jest.mock('@react-email/render', () => ({
  render: jest.fn().mockResolvedValue('<html>mock</html>'),
}));
jest.mock('../../modules/mail/templates/SchedulePublicationEmail', () => ({
  SchedulePublicationEmail: () => null,
}));
jest.mock('../../modules/mail/mail-i18n', () => ({
  getMailTranslations: () => ({
    subjects: { schedulePublication: () => 'Planning publié' },
  }),
}));
jest.mock('../../common/metrics', () => ({
  emailSendCounter: { add: jest.fn() },
}));

import { batchEmailPublishTask } from './batch-email-publish';
import { emailSendCounter } from '../../common/metrics';

const counterMock = emailSendCounter.add as jest.Mock;
const runTask = (
  batchEmailPublishTask as unknown as {
    run: (payload: {
      emails: Array<{ to: string; firstName: string; shiftCount: number; locale?: 'fr' | 'en' }>;
      month: string;
      clinicName: string;
      idempotencyKey?: string;
    }) => Promise<{ sent: number }>;
  }
).run;

const basePayload = {
  emails: [{ to: 'vet@clinic.fr', firstName: 'Sarah', shiftCount: 12, locale: 'fr' as const }],
  month: '2026-07',
  clinicName: 'Clinique du Parc',
  idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000',
};

describe('batchEmailPublishTask.run — Story 11-4 reliable publication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    batchSend.mockResolvedValue({ data: { data: [{ id: 'e1' }] }, error: null });
  });

  it('passes a per-chunk Resend idempotency key so retries never duplicate', async () => {
    await runTask(basePayload);
    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledWith(expect.any(Array), {
      idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000-c0',
    });
  });

  it('throws when Resend returns an error so maxAttempts retries run', async () => {
    batchSend.mockResolvedValue({ data: null, error: { message: 'resend down' } });
    await expect(runTask(basePayload)).rejects.toThrow(/failed to send/);
  });

  it('throws when the Resend batch send call itself rejects', async () => {
    batchSend.mockRejectedValue(new Error('ECONNRESET'));
    await expect(runTask(basePayload)).rejects.toThrow(/failed to send/);
  });

  it('emits emailSendCounter failure so a silent outage is observable', async () => {
    batchSend.mockResolvedValue({ data: null, error: { message: 'resend down' } });
    await expect(runTask(basePayload)).rejects.toThrow();
    expect(counterMock).toHaveBeenCalledWith(1, {
      type: 'schedule_publication',
      outcome: 'failure',
    });
  });

  it('returns { sent } and does not throw when every send succeeds', async () => {
    const result = await runTask(basePayload);
    expect(result).toEqual({ sent: 1 });
    expect(counterMock).toHaveBeenCalledWith(1, {
      type: 'schedule_publication',
      outcome: 'success',
    });
  });
});
