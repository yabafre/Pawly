import { task, logger } from '@trigger.dev/sdk';
import { createElement } from 'react';
import { render } from '@react-email/render';
import { SchedulePublicationEmail } from '../../modules/mail/templates/SchedulePublicationEmail';
import {
  getMailTranslations,
  type MailLocale,
} from '../../modules/mail/mail-i18n';
import { getResend, mailFrom } from '../lib/resend';
import { emailSendCounter } from '../../common/metrics';

const BATCH_SIZE = 100;

interface BatchEmailPayload {
  emails: Array<{
    to: string;
    firstName: string;
    shiftCount: number;
    locale?: MailLocale;
  }>;
  month: string;
  clinicName: string;
  // Story 11-4 — stable seed for the per-chunk Resend idempotency key.
  // OPTIONAL in the type to avoid a transient compile break, but publishPlan
  // ALWAYS passes it (see planning-generation.service.ts, Task 5). Constant
  // across the retries of one publish (so a replay never duplicates a
  // delivered email) and unique per publish invocation (so a legitimate
  // re-publish re-notifies). Built as
  // `schedule-publish/<clinicId>:<month>:<publishedAtMs>`.
  idempotencyKey?: string;
}

export const batchEmailPublishTask = task({
  id: 'batch-email-publish',
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: BatchEmailPayload) => {
    const { emails, month, clinicName, idempotencyKey } = payload;

    if (emails.length === 0) {
      logger.info('No emails to send');
      return { sent: 0 };
    }

    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';
    const dashboardUrl = `${webAppUrl}/dashboard/schedule`;

    // Pre-render HTML per employee
    const emailPayloads: Array<{
      from: string;
      to: string;
      subject: string;
      html: string;
    }> = [];
    for (const emp of emails) {
      try {
        const empLocale: MailLocale = emp.locale ?? 'fr';
        const t = getMailTranslations(empLocale);
        const html = await render(
          createElement(SchedulePublicationEmail, {
            firstName: emp.firstName,
            month,
            clinicName,
            dashboardUrl,
            shiftCount: emp.shiftCount,
            locale: empLocale,
          }),
        );
        emailPayloads.push({
          from: mailFrom,
          to: emp.to,
          subject: t.subjects.schedulePublication(clinicName, month),
          html,
        });
      } catch (err) {
        logger.error(`Failed to render email for ${emp.to}`, {
          error: String(err),
        });
      }
    }

    // Chunk into batches of 100 (Resend batch limit). Story 11-4 (AC1): each
    // chunk carries a stable idempotency key so Trigger.dev's retries (below)
    // re-send WITHOUT duplicating already-delivered emails — Resend returns
    // the original response for a repeated (key, identical payload). The key
    // is unique per chunk and per publish invocation.
    let totalSent = 0;
    let failedCount = 0;
    for (let i = 0; i < emailPayloads.length; i += BATCH_SIZE) {
      const chunk = emailPayloads.slice(i, i + BATCH_SIZE);
      const chunkIndex = Math.floor(i / BATCH_SIZE);
      const sendOptions = idempotencyKey
        ? { idempotencyKey: `${idempotencyKey}-c${chunkIndex}` }
        : undefined;
      try {
        const { data, error } = await getResend().batch.send(
          chunk,
          sendOptions,
        );
        if (error) {
          failedCount += chunk.length;
          logger.error(`Batch email send error`, {
            error: error.message,
            chunkIndex,
          });
        } else {
          totalSent += data?.data?.length ?? chunk.length;
        }
      } catch (err) {
        failedCount += chunk.length;
        logger.error(`Batch email send failed for chunk ${chunkIndex + 1}`, {
          error: String(err),
        });
      }
    }

    // Story 11-4 (AC3) — emit the metric so a silent notification outage is
    // observable (mirrors batch-push-publish.ts). Emitted on every attempt; a
    // sustained `outcome:failure` spike across the 5 retries is the alert
    // signal. The idempotency keys above keep the retry duplicate-safe.
    emailSendCounter.add(totalSent, {
      type: 'schedule_publication',
      outcome: 'success',
    });
    if (failedCount > 0) {
      emailSendCounter.add(failedCount, {
        type: 'schedule_publication',
        outcome: 'failure',
      });
    }

    logger.info(`Batch email publish complete`, {
      totalSent,
      failedCount,
      totalEmails: emails.length,
    });

    // Story 11-4 (AC1) — throw when any send failed so Trigger.dev's
    // maxAttempts:5 retries actually run, instead of returning success
    // unconditionally.
    if (failedCount > 0) {
      throw new Error(
        `batch-email-publish: ${failedCount}/${emailPayloads.length} emails failed to send — retrying`,
      );
    }

    return { sent: totalSent };
  },
});
