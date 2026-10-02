import { logger } from '../utils/logger.js';
import { formatFromHeader } from './fromHeader.js';
import { createLogMailer } from './logMailer.js';
import type { Mailer } from './mailer.js';
import { createSmtpMailer, requiresStartTls } from './smtpMailer.js';

export interface MailerConfig {
  smtpHost: string | undefined;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | undefined;
  smtpPassword: string | undefined;
  /** The sender address, or a whole From header (see mail/fromHeader.ts). */
  mailFrom: string;
  /** Display name shown beside the address; optional. */
  mailFromName: string | undefined;
}

/**
 * Picks the mailer from configuration: SMTP when a host is set, otherwise the
 * logging one. Production cannot reach the second branch — the env schema
 * requires SMTP_HOST there (config/env.ts).
 *
 * Every value comes from `.env`, so the same code sends to Mailpit in the dev
 * stack and to a real relay once `SMTP_*` names one. The line logged at
 * startup says which it is and whether the connection will be encrypted,
 * because "the e-mails stopped arriving" is otherwise a long afternoon.
 */
export function createMailer(config: MailerConfig): Mailer {
  if (config.smtpHost === undefined) {
    logger.warn('SMTP_HOST is not set: account e-mails will be written to the log, not sent');
    return createLogMailer();
  }
  const options = {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    user: config.smtpUser,
    password: config.smtpPassword,
    from: formatFromHeader(config.mailFrom, config.mailFromName),
  };
  logger.info('Sending account e-mail over SMTP', {
    host: options.host,
    port: options.port,
    secure: options.secure,
    requireStartTls: requiresStartTls(options),
    authenticated: options.user !== undefined,
    from: options.from,
  });
  return createSmtpMailer(options);
}
