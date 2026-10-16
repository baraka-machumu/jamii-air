import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfig } from '../../config/app-config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Transactional email over SMTP. One path for both environments: Mailpit locally (no credentials,
 * UI on MAILPIT_UI_PORT) and a real provider elsewhere (Resend on UAT, Plan 5.0) with a user and
 * password. A provider SDK would buy nothing here - the messages are plain text and the only
 * thing that changes is the host.
 *
 * Sent after the database work has committed (SP-09).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;

  constructor(private readonly config: AppConfig) {
    const { host, port, secure, user, password } = config.smtp;
    this.transport = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
  }

  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.config.smtp.from, ...mail });
    // Never the address or the body: a reset code in a log is a reset code that leaked (SR-05).
    this.logger.log({ subject: mail.subject }, 'mail sent');
  }
}
