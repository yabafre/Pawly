import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { MagicLinkEmail } from './templates/MagicLinkEmail';
import { ActivationEmail } from './templates/ActivationEmail';
import { SchoolDaysDeclarationEmail } from './templates/SchoolDaysDeclarationEmail';
import { SchoolDaysReminderEmail } from './templates/SchoolDaysReminderEmail';
import { EmployeeInvitationEmail } from './templates/EmployeeInvitationEmail';
import type { EnvConfig } from '@/config/index';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService<EnvConfig, true>) {
    this.resend = new Resend(
      this.configService.get('RESEND_API_KEY', { infer: true }),
    );
  }

  async sendMagicLink(email: string, url: string) {
    try {
      const html = await render(<MagicLinkEmail url={url} />);

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
}
