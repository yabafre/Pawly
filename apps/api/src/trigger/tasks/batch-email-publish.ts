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

    // Chunk over the STABLE input `emails` array (Resend batch limit 100) and
    // render per chunk. Story 11-4 (AC1): keying the idempotency key off the
    // input chunk's ordinal position (`-cN`) — instead of the post-render
    // payload array — anchors each chunk to the same input recipients across
    // every retry attempt. A render failure inside a chunk therefore shrinks
    // that one chunk's send payload but never shifts later recipients into a
    // different chunk (which would remap their `-cN` key and risk a duplicate
    // delivery or a Resend 409 on retry). Trigger.dev's retries (below)
    // re-send with the SAME per-chunk key, so Resend returns the original
    // response for an already-delivered chunk — no duplicate.
    let totalSent = 0;
    let sendFailedCount = 0;
    let renderFailedCount = 0;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const inputChunk = emails.slice(i, i + BATCH_SIZE);
      const chunkIndex = Math.floor(i / BATCH_SIZE);

      // Render this chunk. A render failure drops that single recipient — bad
      // data is deterministic, so retrying the whole run cannot fix it — but
      // it is counted (AC3/NFR3) so it surfaces in the failure metric below
      // instead of silently reading as a successful publish.
      const chunk: Array<{
        from: string;
        to: string;
        subject: string;
        html: string;
      }> = [];
      for (const emp of inputChunk) {
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
          chunk.push({
            from: mailFrom,
            to: emp.to,
            subject: t.subjects.schedulePublication(clinicName, month),
            html,
          });
        } catch (err) {
          renderFailedCount++;
          logger.error(`Failed to render email for ${emp.to}`, {
            error: String(err),
          });
        }
      }
      if (chunk.length === 0) continue;

      const sendOptions = idempotencyKey
        ? { idempotencyKey: `${idempotencyKey}-c${chunkIndex}` }
        : undefined;
      try {
        const { data, error } = await getResend().batch.send(
          chunk,
          sendOptions,
        );
        if (error) {
          sendFailedCount += chunk.length;
          logger.error(`Batch email send error`, {
            error: error.message,
            chunkIndex,
          });
        } else {
          totalSent += data?.data?.length ?? chunk.length;
        }
      } catch (err) {
        sendFailedCount += chunk.length;
        logger.error(`Batch email send failed for chunk ${chunkIndex + 1}`, {
          error: String(err),
        });
      }
    }

    // Story 11-4 (AC3) — emit the metric so a silent notification outage is
    // observable (mirrors batch-push-publish.ts). NOTE `success` is a
    // PER-ATTEMPT count: a run that throws below is fully re-executed by
    // Trigger.dev, which re-sends the already-delivered chunks (idempotent
    // no-ops at Resend) and re-adds their count here — so `success` can exceed
    // the number of unique deliveries across the 5 retries. Read it as attempt
    // volume; a sustained `outcome:failure` spike is the alert signal. The
    // per-chunk idempotency keys keep the retry duplicate-safe.
    emailSendCounter.add(totalSent, {
      type: 'schedule_publication',
      outcome: 'success',
    });
    const failedCount = sendFailedCount + renderFailedCount;
    if (failedCount > 0) {
      emailSendCounter.add(failedCount, {
        type: 'schedule_publication',
        outcome: 'failure',
      });
    }

    logger.info(`Batch email publish complete`, {
      totalSent,
      sendFailedCount,
      renderFailedCount,
      totalEmails: emails.length,
    });

    // Story 11-4 (AC1) — throw ONLY on send failures so Trigger.dev's
    // maxAttempts:5 retries actually run against a transient Resend outage.
    // Render failures are deterministic (bad data) — retrying would burn all 5
    // attempts to no effect — so they surface in the metric/logs above but do
    // NOT trigger a retry.
    if (sendFailedCount > 0) {
      throw new Error(
        `batch-email-publish: ${sendFailedCount}/${emails.length} emails failed to send — retrying`,
      );
    }

    return { sent: totalSent };
  },
});
