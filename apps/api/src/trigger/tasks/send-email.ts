import { task, logger } from '@trigger.dev/sdk';
import { createElement } from 'react';
import { render } from '@react-email/render';
import { ActivationEmail } from '../../modules/mail/templates/ActivationEmail';
import { WelcomeEmail } from '../../modules/mail/templates/WelcomeEmail';
import { PlanConfirmationEmail } from '../../modules/mail/templates/PlanConfirmationEmail';
import { MagicLinkEmail } from '../../modules/mail/templates/MagicLinkEmail';
import { OtpCodeEmail } from '../../modules/mail/templates/OtpCodeEmail';
import { PasswordResetEmail } from '../../modules/mail/templates/PasswordResetEmail';
import { EmployeeInvitationEmail } from '../../modules/mail/templates/EmployeeInvitationEmail';
import { SchoolDaysDeclarationEmail } from '../../modules/mail/templates/SchoolDaysDeclarationEmail';
import { SchoolDaysReminderEmail } from '../../modules/mail/templates/SchoolDaysReminderEmail';
import { SchedulePublicationEmail } from '../../modules/mail/templates/SchedulePublicationEmail';
import { AbsenceRequestEmail } from '../../modules/mail/templates/AbsenceRequestEmail';
import { AbsenceReviewEmail } from '../../modules/mail/templates/AbsenceReviewEmail';
import { getMailTranslations, type MailLocale } from '../../modules/mail/mail-i18n';
import { getResend, mailFrom } from '../lib/resend';

type EmailType =
  | 'welcome'
  | 'plan-confirmation'
  | 'magic-link'
  | 'otp'
  | 'password-reset'
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
  const locale = (data.locale as MailLocale) ?? 'fr';
  const t = getMailTranslations(locale);

  switch (type) {
    case 'welcome': {
      const html = await render(createElement(WelcomeEmail, {
        url: data.url as string,
        adminName: data.adminName as string | undefined,
        locale,
      }));
      return { html, subject: t.subjects.welcome };
    }
    case 'plan-confirmation': {
      const plan = (data.plan as 'starter' | 'professional') ?? 'starter';
      const html = await render(createElement(PlanConfirmationEmail, {
        plan,
        adminName: data.adminName as string | undefined,
        dashboardUrl: data.dashboardUrl as string,
        invoiceUrl: data.invoiceUrl as string | undefined,
        locale,
      }));
      return { html, subject: t.subjects.planConfirmation(plan) };
    }
    case 'magic-link': {
      const html = await render(createElement(MagicLinkEmail, {
        url: data.url as string,
        locale,
      }));
      return { html, subject: t.subjects.magicLink };
    }
    case 'otp': {
      const html = await render(createElement(OtpCodeEmail, {
        code: data.code as string,
        locale,
      }));
      return { html, subject: t.subjects.otpCode };
    }
    case 'password-reset': {
      const html = await render(createElement(PasswordResetEmail, {
        url: data.url as string,
        locale,
      }));
      return { html, subject: t.subjects.passwordReset };
    }
    case 'invitation': {
      const html = await render(createElement(EmployeeInvitationEmail, {
        url: data.url as string,
        firstName: data.firstName as string,
        locale,
      }));
      return { html, subject: t.subjects.invitation(data.firstName as string) };
    }
    case 'school-notification': {
      const html = await render(createElement(SchoolDaysDeclarationEmail, {
        adminName: data.adminName as string | undefined,
        apprenticeName: data.apprenticeName as string,
        month: data.month as string,
        dateCount: data.dateCount as number,
        locale,
      }));
      return { html, subject: t.subjects.schoolDaysDeclaration(data.apprenticeName as string, data.month as string) };
    }
    case 'schedule-publication': {
      const html = await render(createElement(SchedulePublicationEmail, {
        firstName: data.firstName as string,
        month: data.month as string,
        clinicName: data.clinicName as string,
        dashboardUrl: data.dashboardUrl as string,
        shiftCount: data.shiftCount as number | undefined,
        locale,
      }));
      return { html, subject: t.subjects.schedulePublication(data.clinicName as string, data.month as string) };
    }
    case 'school-reminder': {
      const html = await render(createElement(SchoolDaysReminderEmail, {
        name: data.name as string,
        month: data.month as string,
        dashboardUrl: data.dashboardUrl as string,
        locale,
      }));
      return { html, subject: t.subjects.schoolDaysReminder(data.month as string) };
    }
    case 'absence-request': {
      const html = await render(createElement(AbsenceRequestEmail, {
        adminName: data.adminName as string | undefined,
        employeeName: data.employeeName as string,
        absenceType: data.absenceType as string,
        startDate: data.startDate as string,
        endDate: data.endDate as string,
        dayCount: data.dayCount as number,
        locale,
      }));
      return { html, subject: t.subjects.absenceRequest(data.employeeName as string) };
    }
    case 'absence-review': {
      const html = await render(createElement(AbsenceReviewEmail, {
        firstName: data.firstName as string,
        status: data.status as 'APPROVED' | 'REJECTED',
        absenceType: data.absenceType as string,
        startDate: data.startDate as string,
        endDate: data.endDate as string,
        rejectionReason: data.rejectionReason as string | undefined,
        locale,
      }));
      return { html, subject: t.subjects.absenceReview(data.status as 'APPROVED' | 'REJECTED') };
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
