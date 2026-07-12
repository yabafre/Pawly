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
import { render } from '@react-email/render';

const counterMock = emailSendCounter.add as jest.Mock;
const renderMock = render as jest.Mock;
const runTask = (
  batchEmailPublishTask as unknown as {
    run: (payload: {
      emails: Array<{
        to: string;
        firstName: string;
        shiftCount: number;
        locale?: 'fr' | 'en';
      }>;
      month: string;
      clinicName: string;
      idempotencyKey?: string;
    }) => Promise<{ sent: number }>;
  }
).run;

const basePayload = {
  emails: [
    {
      to: 'vet@clinic.fr',
      firstName: 'Sarah',
      shiftCount: 12,
      locale: 'fr' as const,
    },
  ],
  month: '2026-07',
  clinicName: 'Clinique du Parc',
  idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000',
};

describe('batchEmailPublishTask.run — Story 11-4 reliable publication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    batchSend.mockResolvedValue({
      data: { data: [{ id: 'e1' }] },
      error: null,
    });
  });

  it('passes a per-chunk Resend idempotency key so retries never duplicate', async () => {
    await runTask(basePayload);
    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(batchSend).toHaveBeenCalledWith(expect.any(Array), {
      idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000-c0',
    });
  });

  it('throws when Resend returns an error so maxAttempts retries run', async () => {
    batchSend.mockResolvedValue({
      data: null,
      error: { message: 'resend down' },
    });
    await expect(runTask(basePayload)).rejects.toThrow(/failed to send/);
  });

  it('throws when the Resend batch send call itself rejects', async () => {
    batchSend.mockRejectedValue(new Error('ECONNRESET'));
    await expect(runTask(basePayload)).rejects.toThrow(/failed to send/);
  });

  it('emits emailSendCounter failure so a silent outage is observable', async () => {
    batchSend.mockResolvedValue({
      data: null,
      error: { message: 'resend down' },
    });
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

  it('chunks >100 recipients over the input array and keys each chunk positionally (-c0/-c1)', async () => {
    const emails = Array.from({ length: 150 }, (_, i) => ({
      to: `e${i}@clinic.fr`,
      firstName: `F${i}`,
      shiftCount: 1,
      locale: 'fr' as const,
    }));
    batchSend.mockImplementation((chunk: unknown[]) =>
      Promise.resolve({
        data: { data: chunk.map((_, i) => ({ id: `id-${i}` })) },
        error: null,
      }),
    );

    const result = await runTask({ ...basePayload, emails });

    expect(batchSend).toHaveBeenCalledTimes(2);
    expect(batchSend).toHaveBeenNthCalledWith(1, expect.any(Array), {
      idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000-c0',
    });
    expect(batchSend).toHaveBeenNthCalledWith(2, expect.any(Array), {
      idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000-c1',
    });
    // chunk boundaries anchored to the input array: 100 then 50
    expect(batchSend.mock.calls[0][0]).toHaveLength(100);
    expect(batchSend.mock.calls[1][0]).toHaveLength(50);
    expect(result).toEqual({ sent: 150 });
  });

  it('accumulates success and failure across chunks and throws when a later chunk fails', async () => {
    const emails = Array.from({ length: 150 }, (_, i) => ({
      to: `e${i}@clinic.fr`,
      firstName: `F${i}`,
      shiftCount: 1,
      locale: 'fr' as const,
    }));
    batchSend
      .mockResolvedValueOnce({
        data: {
          data: Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` })),
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'resend down' } });

    // chunk 0 delivered (100), chunk 1 failed (50) → throw so maxAttempts retries
    await expect(runTask({ ...basePayload, emails })).rejects.toThrow(
      /50\/150 emails failed to send/,
    );
    expect(counterMock).toHaveBeenCalledWith(100, {
      type: 'schedule_publication',
      outcome: 'success',
    });
    expect(counterMock).toHaveBeenCalledWith(50, {
      type: 'schedule_publication',
      outcome: 'failure',
    });
  });

  it('counts a render failure as failure metric without triggering a retry throw', async () => {
    // one recipient renders, one throws — render failures are deterministic
    // (bad data), so they surface in the metric but must NOT burn the retries
    renderMock
      .mockResolvedValueOnce('<html>ok</html>')
      .mockRejectedValueOnce(new Error('bad props'));
    batchSend.mockResolvedValue({
      data: { data: [{ id: 'e1' }] },
      error: null,
    });
    const emails = [
      {
        to: 'a@clinic.fr',
        firstName: 'A',
        shiftCount: 1,
        locale: 'fr' as const,
      },
      {
        to: 'b@clinic.fr',
        firstName: 'B',
        shiftCount: 1,
        locale: 'fr' as const,
      },
    ];

    const result = await runTask({ ...basePayload, emails });

    expect(result).toEqual({ sent: 1 });
    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(batchSend.mock.calls[0][0]).toHaveLength(1);
    expect(counterMock).toHaveBeenCalledWith(1, {
      type: 'schedule_publication',
      outcome: 'failure',
    });
  });

  it('anchors each chunk key to input position even when an early recipient fails to render (m4 regression guard)', async () => {
    // 101 recipients; the FIRST (input index 0, in chunk 0) fails to render.
    // Chunking over the STABLE input array keeps input index 100 in chunk 1
    // (key -c1). Were chunking to regress to the post-render payload array,
    // the 100 successfully-rendered payloads would collapse into a single
    // -c0 chunk and input index 100 would be mis-keyed under -c0 — so this
    // test fails on the old chunking and passes only on the fix.
    renderMock.mockRejectedValueOnce(new Error('bad props'));
    batchSend.mockImplementation((chunk: unknown[]) =>
      Promise.resolve({
        data: { data: chunk.map((_, i) => ({ id: `id-${i}` })) },
        error: null,
      }),
    );
    const emails = Array.from({ length: 101 }, (_, i) => ({
      to: `e${i}@clinic.fr`,
      firstName: `F${i}`,
      shiftCount: 1,
      locale: 'fr' as const,
    }));

    const result = await runTask({ ...basePayload, emails });

    expect(batchSend).toHaveBeenCalledTimes(2);
    expect(batchSend).toHaveBeenNthCalledWith(1, expect.any(Array), {
      idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000-c0',
    });
    // chunk 0 = 100 inputs − 1 render failure = 99 sent under -c0
    expect(batchSend.mock.calls[0][0]).toHaveLength(99);
    expect(batchSend).toHaveBeenNthCalledWith(2, expect.any(Array), {
      idempotencyKey: 'schedule-publish/clinic123:2026-07:1700000000000-c1',
    });
    // input index 100 stays anchored to chunk 1 despite the earlier drop
    expect(batchSend.mock.calls[1][0]).toHaveLength(1);
    expect(result).toEqual({ sent: 100 });
  });
});
