import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { MagicLinkEmail } from './templates/MagicLinkEmail';
import { ActivationEmail } from './templates/ActivationEmail';
import { SchoolDaysDeclarationEmail } from './templates/SchoolDaysDeclarationEmail';
import { SchoolDaysReminderEmail } from './templates/SchoolDaysReminderEmail';
import { EmployeeInvitationEmail } from './templates/EmployeeInvitationEmail';
import { AbsenceRequestEmail } from './templates/AbsenceRequestEmail';
import { AbsenceReviewEmail } from './templates/AbsenceReviewEmail';
import { SchedulePublicationEmail } from './templates/SchedulePublicationEmail';
import { OtpCodeEmail } from './templates/OtpCodeEmail';
import { sendEmailTask } from '@/trigger/client';
import { getMailTranslations, formatDateForLocale, type MailLocale } from './mail-i18n';
import type { EnvConfig } from '@/config/index';
import type { AbsenceType } from '@pawly/validators';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);
  /** Resend allows 2 req/s — enforce 550ms min gap between sends */
  private static readonly MIN_SEND_INTERVAL_MS = 550;
  private throttleChain: Promise<void> = Promise.resolve();

  constructor(private configService: ConfigService<EnvConfig, true>) {
    this.resend = new Resend(
      this.configService.get('RESEND_API_KEY', { infer: true }),
    );
  }

  private get useTrigger(): boolean {
    return !!process.env.TRIGGER_SECRET_KEY;
  }

  async triggerSendEmail(type: string, to: string, data: Record<string, unknown>): Promise<void> {
    try {
      await sendEmailTask.trigger({ type: type as any, to, data });
    } catch (err) {
      this.logger.error(`Failed to trigger send-email task (${type})`, err);
    }
  }

  private throttle(): Promise<void> {
    const next = this.throttleChain.then(
      () => new Promise<void>((r) => setTimeout(r, MailService.MIN_SEND_INTERVAL_MS)),
    );
    this.throttleChain = next.then(() => {
      this.throttleChain = Promise.resolve();
    });
    return next;
  }

  async sendMagicLink(email: string, url: string, locale: MailLocale = 'fr') {
    const t = getMailTranslations(locale);
    try {
      const html = await render(<MagicLinkEmail url={url} locale={locale} />);

      await this.throttle();
      const { data, error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: email,
        subject: t.subjects.magicLink,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send magic link email: ${error.message}`);
        throw new InternalServerErrorException('Failed to send authentication email');
      }

      return data;
    } catch (err) {
      this.logger.error('Unexpected error sending magic link email', err);
      throw new InternalServerErrorException('Failed to send authentication email');
    }
  }

  async sendActivationEmail(email: string, url: string, adminName?: string, locale: MailLocale = 'fr') {
    const t = getMailTranslations(locale);
    try {
      const html = await render(<ActivationEmail url={url} adminName={adminName} locale={locale} />);

      await this.throttle();
      const { data, error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: email,
        subject: t.subjects.activation,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send activation email: ${error.message}`);
        throw new InternalServerErrorException('Failed to send activation email');
      }

      return data;
    } catch (err) {
      this.logger.error('Unexpected error sending activation email', err);
      throw new InternalServerErrorException('Failed to send activation email');
    }
  }

  async sendEmployeeInvitationEmail(email: string, url: string, firstName: string, locale: MailLocale = 'fr') {
    const t = getMailTranslations(locale);
    if (this.useTrigger) {
      return this.triggerSendEmail('invitation', email, { url, firstName, locale });
    }
    try {
      const html = await render(<EmployeeInvitationEmail url={url} firstName={firstName} locale={locale} />);

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: email,
        subject: t.subjects.invitation(firstName),
        html,
      });

      if (error) {
        this.logger.error(`Failed to send employee invitation email: ${error.message}`);
      }
    } catch (err) {
      this.logger.error('Unexpected error sending employee invitation email', err);
    }
  }

  async sendSchoolDaysNotification(
    adminEmail: string,
    adminName: string | undefined,
    apprenticeName: string,
    month: string,
    dateCount: number,
    locale: MailLocale = 'fr',
  ) {
    const t = getMailTranslations(locale);
    if (this.useTrigger) {
      return this.triggerSendEmail('school-notification', adminEmail, { adminName, apprenticeName, month, dateCount, locale });
    }
    try {
      const html = await render(
        <SchoolDaysDeclarationEmail
          adminName={adminName}
          apprenticeName={apprenticeName}
          month={month}
          dateCount={dateCount}
          locale={locale}
        />,
      );

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: adminEmail,
        subject: t.subjects.schoolDaysDeclaration(apprenticeName, month),
        html,
      });

      if (error) {
        this.logger.error(`Failed to send school days notification: ${error.message}`);
      }
    } catch (err) {
      this.logger.error('Unexpected error sending school days notification', err);
    }
  }

  async sendSchedulePublicationEmail(
    employeeEmail: string,
    firstName: string,
    month: string,
    clinicName: string,
    shiftCount?: number,
    locale: MailLocale = 'fr',
  ) {
    const t = getMailTranslations(locale);
    if (this.useTrigger) {
      const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
      const dashboardUrl = `${webAppUrl}/dashboard/schedule`;
      return this.triggerSendEmail('schedule-publication', employeeEmail, { firstName, month, clinicName, dashboardUrl, shiftCount, locale });
    }
    try {
      const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
      const dashboardUrl = `${webAppUrl}/dashboard/schedule`;

      const html = await render(
        <SchedulePublicationEmail
          firstName={firstName}
          month={month}
          clinicName={clinicName}
          dashboardUrl={dashboardUrl}
          shiftCount={shiftCount}
          locale={locale}
        />,
      );

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: employeeEmail,
        subject: t.subjects.schedulePublication(clinicName, month),
        html,
      });

      if (error) {
        this.logger.error(`Failed to send schedule publication email to ${employeeEmail}: ${error.message}`);
      }
    } catch (err) {
      this.logger.error('Unexpected error sending schedule publication email', err);
    }
  }

  async sendBatchSchedulePublicationEmails(
    emails: Array<{
      to: string;
      firstName: string;
      shiftCount: number;
      locale?: MailLocale;
    }>,
    month: string,
    clinicName: string,
  ): Promise<number> {
    if (emails.length === 0) return 0;

    const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
    const dashboardUrl = `${webAppUrl}/dashboard/schedule`;
    const from = this.configService.get('MAIL_FROM', { infer: true });
    let notifiedCount = 0;

    // Pre-render HTML per employee (each has unique firstName and shiftCount)
    const emailPayloads: Array<{ from: string; to: string; subject: string; html: string }> = [];
    for (const emp of emails) {
      try {
        const empLocale: MailLocale = emp.locale ?? 'fr';
        const t = getMailTranslations(empLocale);
        const html = await render(
          <SchedulePublicationEmail
            firstName={emp.firstName}
            month={month}
            clinicName={clinicName}
            dashboardUrl={dashboardUrl}
            shiftCount={emp.shiftCount}
            locale={empLocale}
          />,
        );
        emailPayloads.push({
          from,
          to: emp.to,
          subject: t.subjects.schedulePublication(clinicName, month),
          html,
        });
      } catch (err) {
        this.logger.error(`Failed to render email for ${emp.to}: ${err}`);
      }
    }

    // Chunk into batches of 100 (Resend batch limit)
    const BATCH_SIZE = 100;
    for (let i = 0; i < emailPayloads.length; i += BATCH_SIZE) {
      const chunk = emailPayloads.slice(i, i + BATCH_SIZE);
      try {
        await this.throttle();
        const { data, error } = await this.resend.batch.send(chunk);
        if (error) {
          this.logger.error(`Batch email send error: ${error.message}`);
        } else {
          notifiedCount += data?.data?.length ?? chunk.length;
        }
      } catch (err) {
        this.logger.error(`Batch email send failed for chunk ${i / BATCH_SIZE + 1}: ${err}`);
      }
    }

    return notifiedCount;
  }

  async sendSchoolDaysReminder(
    apprenticeEmail: string,
    name: string,
    month: string,
    locale: MailLocale = 'fr',
  ) {
    const t = getMailTranslations(locale);
    if (this.useTrigger) {
      const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
      const dashboardUrl = `${webAppUrl}/dashboard/school-days`;
      return this.triggerSendEmail('school-reminder', apprenticeEmail, { name, month, dashboardUrl, locale });
    }
    try {
      const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
      const dashboardUrl = `${webAppUrl}/dashboard/school-days`;
      const html = await render(
        <SchoolDaysReminderEmail name={name} month={month} dashboardUrl={dashboardUrl} locale={locale} />,
      );

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: apprenticeEmail,
        subject: t.subjects.schoolDaysReminder(month),
        html,
      });

      if (error) {
        this.logger.error(`Failed to send school days reminder: ${error.message}`);
      }
    } catch (err) {
      this.logger.error('Unexpected error sending school days reminder', err);
    }
  }

  async sendOtpCode(email: string, code: string, locale: MailLocale = 'fr') {
    const t = getMailTranslations(locale);
    try {
      const html = await render(<OtpCodeEmail code={code} locale={locale} />);

      await this.throttle();
      const { data, error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: email,
        subject: t.subjects.otpCode,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send OTP code email: ${error.message}`);
        throw new InternalServerErrorException('Failed to send authentication email');
      }

      return data;
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      this.logger.error('Unexpected error sending OTP code email', err);
      throw new InternalServerErrorException('Failed to send authentication email');
    }
  }

  async sendAbsenceRequestNotification(
    adminEmail: string,
    adminName: string | undefined,
    employeeName: string,
    absenceType: AbsenceType,
    startDate: Date,
    endDate: Date,
    dayCount: number,
    locale: MailLocale = 'fr',
  ) {
    const t = getMailTranslations(locale);
    if (this.useTrigger) {
      return this.triggerSendEmail('absence-request', adminEmail, {
        adminName, employeeName, absenceType,
        startDate: formatDateForLocale(startDate, locale),
        endDate: formatDateForLocale(endDate, locale),
        dayCount, locale,
      });
    }
    try {
      const html = await render(
        <AbsenceRequestEmail
          adminName={adminName}
          employeeName={employeeName}
          absenceType={absenceType}
          startDate={formatDateForLocale(startDate, locale)}
          endDate={formatDateForLocale(endDate, locale)}
          dayCount={dayCount}
          locale={locale}
        />,
      );

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: adminEmail,
        subject: t.subjects.absenceRequest(employeeName),
        html,
      });

      if (error) {
        this.logger.error(`Failed to send absence request notification: ${error.message}`);
      }
    } catch (err) {
      this.logger.error('Unexpected error sending absence request notification', err);
    }
  }

  async sendAbsenceReviewNotification(
    employeeEmail: string,
    firstName: string,
    status: 'APPROVED' | 'REJECTED',
    absenceType: AbsenceType,
    startDate: Date,
    endDate: Date,
    rejectionReason?: string,
    locale: MailLocale = 'fr',
  ) {
    const t = getMailTranslations(locale);
    if (this.useTrigger) {
      return this.triggerSendEmail('absence-review', employeeEmail, {
        firstName, status, absenceType,
        startDate: formatDateForLocale(startDate, locale),
        endDate: formatDateForLocale(endDate, locale),
        rejectionReason, locale,
      });
    }
    try {
      const html = await render(
        <AbsenceReviewEmail
          firstName={firstName}
          status={status}
          absenceType={absenceType}
          startDate={formatDateForLocale(startDate, locale)}
          endDate={formatDateForLocale(endDate, locale)}
          rejectionReason={rejectionReason}
          locale={locale}
        />,
      );

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: employeeEmail,
        subject: t.subjects.absenceReview(status),
        html,
      });

      if (error) {
        this.logger.error(`Failed to send absence review notification: ${error.message}`);
      }
    } catch (err) {
      this.logger.error('Unexpected error sending absence review notification', err);
    }
  }
}
