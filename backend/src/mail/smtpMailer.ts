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
  /** The From header, e.g. "Allocademy <no-reply@university.edu>". */
  from: string;
}

/**
 * Whether the connection must be encrypted before anything is said on it.
 *
 * A credential is only ever sent over TLS. On an implicitly encrypted port
 * (465) that is already true; on 587 the connection starts in the clear and is
 * upgraded, and nodemailer will only ATTEMPT that upgrade unless it is told to
 * require it — so a server that silently stopped offering STARTTLS would get
 * the password in plain text. `requireTLS` turns that into a failed send.
 *
 * It is derived rather than configured because it is a security property, not
 * a preference: there is no value of a setting that should let a password go
 * out unencrypted. With no credentials there is nothing to protect, which is
 * what keeps Mailpit — which offers no TLS at all — working untouched.
 */
export function requiresStartTls(
  options: Pick<SmtpOptions, 'secure' | 'user' | 'password'>,
): boolean {
  return !options.secure && options.user !== undefined && options.password !== undefined;
}

/**
 * Sends through an SMTP server. With no SMTP settings in `.env` that server is
 * Mailpit, which accepts everything and shows it at http://localhost:8025
 * instead of delivering it, so the whole invitation flow can be walked through
 * without sending a real e-mail to anyone. Point `SMTP_*` at a real relay —
 * Brevo on smtp-relay.brevo.com:587, for instance — and the same code delivers
 * for real.
 */
export function createSmtpMailer(options: SmtpOptions): Mailer {
  // One pooled transport for the process: a connection per e-mail would make
  // creating thirty students from a CSV thirty handshakes.
  const transport: Transporter = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    requireTLS: requiresStartTls(options),
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
