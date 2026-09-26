import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../utils/logger.js';
import type { EmailMessage, Mailer } from './mailer.js';

export interface SmtpOptions {
  host: string;
  port: number;
  /** TLS from the first byte (port 465). Port 587 upgrades with STARTTLS. */
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  /** The From header, e.g. "Course Registration <no-reply@university.edu>". */
  from: string;
}

/**
 * Sends through an SMTP server. In development that server is Mailpit, which
 * accepts everything and shows it at http://localhost:8025 instead of
 * delivering it, so the whole invitation flow can be walked through without
 * sending a real e-mail to anyone.
 */
export function createSmtpMailer(options: SmtpOptions): Mailer {
  // One pooled transport for the process: a connection per e-mail would make
  // creating thirty students from a CSV thirty handshakes.
  const transport: Transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    pool: true,
    ...(options.user !== undefined && options.password !== undefined
      ? { auth: { user: options.user, pass: options.password } }
      : {}),
  });

  return {
    kind: 'smtp',
    async send(message: EmailMessage) {
      await transport.sendMail({
        from: options.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      // The recipient and subject only: the body carries a single-use link.
      logger.info('E-mail sent', { to: message.to, subject: message.subject });
    },
  };
}
