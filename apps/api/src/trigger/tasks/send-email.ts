import { task, logger } from '@trigger.dev/sdk';
import { createElement } from 'react';
import { render } from '@react-email/render';
import { EmployeeInvitationEmail } from '../../modules/mail/templates/EmployeeInvitationEmail';
import { SchoolDaysDeclarationEmail } from '../../modules/mail/templates/SchoolDaysDeclarationEmail';
import { SchoolDaysReminderEmail } from '../../modules/mail/templates/SchoolDaysReminderEmail';
import { SchedulePublicationEmail } from '../../modules/mail/templates/SchedulePublicationEmail';
import { AbsenceRequestEmail } from '../../modules/mail/templates/AbsenceRequestEmail';
import { AbsenceReviewEmail } from '../../modules/mail/templates/AbsenceReviewEmail';
import { getResend, mailFrom } from '../lib/resend';

type EmailType =
  | 'invitation'
  | 'school-notification'
  | 'schedule-publication'
  | 'school-reminder'
  | 'absence-request'
  | 'absence-review';

interface SendEmailPayload {
  type: EmailType;
  to: string;
  data: Record<string, unknown>;
}

const MIN_SEND_INTERVAL_MS = 550;

async function renderEmail(type: EmailType, data: Record<string, unknown>): Promise<{ html: string; subject: string }> {
  switch (type) {
    case 'invitation': {
      const html = await render(createElement(EmployeeInvitationEmail, {
        url: data.url as string,
        firstName: data.firstName as string,
      }));
      return { html, subject: `${data.firstName}, bienvenue dans l'équipe Pawly !` };
    }
    case 'school-notification': {
      const html = await render(createElement(SchoolDaysDeclarationEmail, {
        adminName: data.adminName as string | undefined,
        apprenticeName: data.apprenticeName as string,
        month: data.month as string,
        dateCount: data.dateCount as number,
      }));
      return { html, subject: `${data.apprenticeName} a déclaré ses jours d'école pour ${data.month}` };
    }
    case 'schedule-publication': {
      const html = await render(createElement(SchedulePublicationEmail, {
        firstName: data.firstName as string,
        month: data.month as string,
        clinicName: data.clinicName as string,
        dashboardUrl: data.dashboardUrl as string,
        shiftCount: data.shiftCount as number | undefined,
      }));
      return { html, subject: `${data.clinicName} — Votre planning pour ${data.month} est publié` };
    }
    case 'school-reminder': {
      const html = await render(createElement(SchoolDaysReminderEmail, {
        name: data.name as string,
        month: data.month as string,
        dashboardUrl: data.dashboardUrl as string,
      }));
      return { html, subject: `Rappel: déclarez vos jours d'école pour ${data.month}` };
    }
    case 'absence-request': {
      const html = await render(createElement(AbsenceRequestEmail, {
        adminName: data.adminName as string | undefined,
        employeeName: data.employeeName as string,
        absenceType: data.absenceType as string,
        startDate: data.startDate as string,
        endDate: data.endDate as string,
        dayCount: data.dayCount as number,
      }));
      return { html, subject: `${data.employeeName} a soumis une demande d'absence` };
    }
    case 'absence-review': {
      const statusLabel = data.status === 'APPROVED' ? 'approuvée' : 'refusée';
      const html = await render(createElement(AbsenceReviewEmail, {
        firstName: data.firstName as string,
        status: data.status as 'APPROVED' | 'REJECTED',
        absenceType: data.absenceType as string,
        startDate: data.startDate as string,
        endDate: data.endDate as string,
        rejectionReason: data.rejectionReason as string | undefined,
      }));
      return { html, subject: `Votre demande d'absence a été ${statusLabel}` };
    }
  }
}

export const sendEmailTask = task({
  id: 'send-email',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: SendEmailPayload) => {
    const { type, to, data } = payload;

    const { html, subject } = await renderEmail(type, data);

    await new Promise((r) => setTimeout(r, MIN_SEND_INTERVAL_MS));

    const { error } = await getResend().emails.send({ from: mailFrom, to, subject, html });

    if (error) {
      logger.error(`Failed to send ${type} email`, { to, error: error.message });
      throw new Error(`Email send failed: ${error.message}`);
    }

    logger.info(`Sent ${type} email`, { to });
    return { sent: true };
  },
});
