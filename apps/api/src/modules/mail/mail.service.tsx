import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { MagicLinkEmail } from './templates/MagicLinkEmail';
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
}
