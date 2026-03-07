import { task, logger } from '@trigger.dev/sdk';
import { createElement } from 'react';
import { render } from '@react-email/render';
import { SchedulePublicationEmail } from '../../modules/mail/templates/SchedulePublicationEmail';
import { getResend, mailFrom } from '../lib/resend';

const BATCH_SIZE = 100;

interface BatchEmailPayload {
  emails: Array<{ to: string; firstName: string; shiftCount: number }>;
  month: string;
  clinicName: string;
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
    const { emails, month, clinicName } = payload;

    if (emails.length === 0) {
      logger.info('No emails to send');
      return { sent: 0 };
    }

    const webAppUrl = process.env.WEB_APP_URL ?? 'http://localhost:3000';
    const dashboardUrl = `${webAppUrl}/dashboard/schedule`;

    // Pre-render HTML per employee
    const emailPayloads: Array<{ from: string; to: string; subject: string; html: string }> = [];
    for (const emp of emails) {
      try {
        const html = await render(
          createElement(SchedulePublicationEmail, {
            firstName: emp.firstName,
            month,
            clinicName,
            dashboardUrl,
            shiftCount: emp.shiftCount,
          }),
        );
        emailPayloads.push({
          from: mailFrom,
          to: emp.to,
          subject: `${clinicName} — Votre planning pour ${month} est publié`,
          html,
        });
      } catch (err) {
        logger.error(`Failed to render email for ${emp.to}`, { error: String(err) });
      }
    }

    // Chunk into batches of 100 (Resend batch limit)
    let totalSent = 0;
    for (let i = 0; i < emailPayloads.length; i += BATCH_SIZE) {
      const chunk = emailPayloads.slice(i, i + BATCH_SIZE);
      try {
        const { data, error } = await getResend().batch.send(chunk);
        if (error) {
          logger.error(`Batch email send error`, { error: error.message });
        } else {
          totalSent += data?.data?.length ?? chunk.length;
        }
      } catch (err) {
        logger.error(`Batch email send failed for chunk ${Math.floor(i / BATCH_SIZE) + 1}`, { error: String(err) });
      }
    }

    logger.info(`Batch email publish complete`, { totalSent, totalEmails: emails.length });
    return { sent: totalSent };
  },
});
