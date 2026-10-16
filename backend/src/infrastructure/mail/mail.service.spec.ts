import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import { MailService } from './mail.service.js';

const sendMail = vi.fn().mockResolvedValue(undefined);
const createTransport = vi.spyOn(nodemailer, 'createTransport');

const config = (smtp: Partial<AppConfig['smtp']> = {}): AppConfig => ({
  smtp: {
    host: 'localhost', port: 1025, from: 'Jamii Air <no-reply@jamii-air.local>',
    user: null, password: null, secure: false, ...smtp,
  },
} as AppConfig);

beforeEach(() => {
  vi.clearAllMocks();
  createTransport.mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
});

describe('MailService', () => {
  it('sends without credentials against Mailpit, which is local development', () => {
    new MailService(config());
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'localhost', port: 1025, secure: false }));
    expect(createTransport.mock.calls[0]![0]).not.toHaveProperty('auth');
  });

  it('authenticates when a provider is configured', () => {
    new MailService(config({ host: 'smtp.resend.com', port: 587, user: 'resend', password: 're_key' }));
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.resend.com', port: 587, secure: false, auth: { user: 'resend', pass: 're_key' },
    }));
  });

  it('puts the configured sender on the message and does not pass `kind` to the transport', async () => {
    await new MailService(config()).send({
      to: 'amina@example.com', subject: 'Your Jamii Air code: 273940', text: 'code: 273940', kind: 'password-reset',
    });
    const sent = sendMail.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.from).toBe('Jamii Air <no-reply@jamii-air.local>');
    expect(sent.to).toBe('amina@example.com');
    expect(sent).not.toHaveProperty('kind');
  });

  // The reason this test exists: a reset email carries its code in the subject, so logging the
  // subject writes a live credential into the log and undoes SR-05, which hashes the code so it
  // cannot be read back. This caught exactly that, found by reading UAT's logs on 2026-10-16.
  it('never writes the address, the body or the subject to the log', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new MailService(config()).send({
      to: 'amina@example.com', subject: 'Your Jamii Air code: 273940', text: 'Your code is 273940', kind: 'password-reset',
    });

    expect(log).toHaveBeenCalledWith({ kind: 'password-reset' }, 'mail sent');
    const written = JSON.stringify(log.mock.calls);
    for (const secret of ['273940', 'amina@example.com', 'Your Jamii Air code']) {
      expect(written).not.toContain(secret);
    }
  });
});
