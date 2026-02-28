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

  private throttle(): Promise<void> {
    this.throttleChain = this.throttleChain.then(
      () => new Promise((r) => setTimeout(r, MailService.MIN_SEND_INTERVAL_MS)),
    );
    return this.throttleChain;
  }

  async sendMagicLink(email: string, url: string) {
    try {
      const html = await render(<MagicLinkEmail url={url} />);

      await this.throttle();
      const { data, error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: email,
        subject: 'Your Magic Link for Pawly',
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

  async sendActivationEmail(email: string, url: string, adminName?: string) {
    try {
      const html = await render(<ActivationEmail url={url} adminName={adminName} />);

      await this.throttle();
      const { data, error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: email,
        subject: 'Complete your Pawly account setup',
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

  async sendEmployeeInvitationEmail(email: string, url: string, firstName: string) {
    try {
      const html = await render(<EmployeeInvitationEmail url={url} firstName={firstName} />);

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: email,
        subject: `${firstName}, bienvenue dans l'équipe Pawly !`,
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
  ) {
    try {
      const html = await render(
        <SchoolDaysDeclarationEmail
          adminName={adminName}
          apprenticeName={apprenticeName}
          month={month}
          dateCount={dateCount}
        />,
      );

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: adminEmail,
        subject: `${apprenticeName} a déclaré ses jours d'école pour ${month}`,
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
  ) {
    try {
      const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
      const dashboardUrl = `${webAppUrl}/dashboard`;

      const html = await render(
        <SchedulePublicationEmail
          firstName={firstName}
          month={month}
          clinicName={clinicName}
          dashboardUrl={dashboardUrl}
        />,
      );

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: employeeEmail,
        subject: `${clinicName} — Votre planning pour ${month} est publié`,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send schedule publication email to ${employeeEmail}: ${error.message}`);
      }
    } catch (err) {
      this.logger.error('Unexpected error sending schedule publication email', err);
    }
  }

  async sendSchoolDaysReminder(
    apprenticeEmail: string,
    name: string,
    month: string,
  ) {
    try {
      const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true }) ?? '';
      const dashboardUrl = `${webAppUrl}/dashboard/school-days`;
      const html = await render(
        <SchoolDaysReminderEmail name={name} month={month} dashboardUrl={dashboardUrl} />,
      );

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: apprenticeEmail,
        subject: `Rappel: déclarez vos jours d'école pour ${month}`,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send school days reminder: ${error.message}`);
      }
    } catch (err) {
      this.logger.error('Unexpected error sending school days reminder', err);
    }
  }

  async sendOtpCode(email: string, code: string) {
    try {
      const html = await render(<OtpCodeEmail code={code} />);

      await this.throttle();
      const { data, error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: email,
        subject: 'Votre code Pawly',
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
  ) {
    try {
      const formatDate = (d: Date) =>
        d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      const html = await render(
        <AbsenceRequestEmail
          adminName={adminName}
          employeeName={employeeName}
          absenceType={absenceType}
          startDate={formatDate(startDate)}
          endDate={formatDate(endDate)}
          dayCount={dayCount}
        />,
      );

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: adminEmail,
        subject: `${employeeName} a soumis une demande d'absence`,
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
  ) {
    try {
      const formatDate = (d: Date) =>
        d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      const html = await render(
        <AbsenceReviewEmail
          firstName={firstName}
          status={status}
          absenceType={absenceType}
          startDate={formatDate(startDate)}
          endDate={formatDate(endDate)}
          rejectionReason={rejectionReason}
        />,
      );

      const statusLabel = status === 'APPROVED' ? 'approuvée' : 'refusée';

      await this.throttle();
      const { error } = await this.resend.emails.send({
        from: this.configService.get('MAIL_FROM', { infer: true }),
        to: employeeEmail,
        subject: `Votre demande d'absence a été ${statusLabel}`,
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
