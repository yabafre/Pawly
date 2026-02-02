import { Injectable, UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { MagicLinkEmail } from './templates/MagicLinkEmail';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendMagicLink(email: string, url: string) {
    try {
      const html = await render(<MagicLinkEmail url={url} />);

      const { data, error } = await this.resend.emails.send({
        from: process.env.MAIL_FROM || 'Pawly <noreply@pawly.app>',
        to: email,
        subject: 'Your Magic Link for Pawly',
        html,
      });

      if (error) {
        this.logger.error(`Failed to send email to ${email}: ${error.message}`);
        throw new InternalServerErrorException('Failed to send authentication email');
      }

      return data;
    } catch (err) {
      this.logger.error(`Unexpected error sending email to ${email}`, err);
      throw new InternalServerErrorException('Failed to send authentication email');
    }
  }
}
