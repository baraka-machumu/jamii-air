import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfig } from '../../config/app-config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Transactional email over SMTP (local: Mailpit, UI on MAILPIT_UI_PORT; production provider: Plan
 * task 5.0). Sent after the database work has committed (SP-09).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;

  constructor(private readonly config: AppConfig) {
    this.transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: false });
  }

  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.config.smtp.from, ...mail });
    this.logger.log({ subject: mail.subject }, 'mail sent');
  }
}
