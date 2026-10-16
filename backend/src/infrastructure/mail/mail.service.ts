import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfig } from '../../config/app-config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /**
   * A stable label for the logs. The subject cannot be used: a reset email puts the code in it
   * ("Your Jamii Air code: 123456"), so logging the subject writes a live credential to the log
   * and undoes SR-05, which hashes the code precisely so it cannot be read back.
   */
  kind: 'password-reset';
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
    const { kind, ...message } = mail;
    await this.transport.sendMail({ from: this.config.smtp.from, ...message });
    // The label only. Not the address, not the body, and not the subject - see Mail.kind.
    this.logger.log({ kind }, 'mail sent');
  }
}
