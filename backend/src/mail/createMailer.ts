import { logger } from '../utils/logger.js';
import { createLogMailer } from './logMailer.js';
import type { Mailer } from './mailer.js';
import { createSmtpMailer } from './smtpMailer.js';

export interface MailerConfig {
  smtpHost: string | undefined;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | undefined;
  smtpPassword: string | undefined;
  mailFrom: string;
}

/**
 * Picks the mailer from configuration: SMTP when a host is set, otherwise the
 * logging one. Production cannot reach the second branch — the env schema
 * requires SMTP_HOST there (config/env.ts).
 */
export function createMailer(config: MailerConfig): Mailer {
  if (config.smtpHost === undefined) {
    logger.warn('SMTP_HOST is not set: account e-mails will be written to the log, not sent');
    return createLogMailer();
  }
  logger.info('Sending account e-mail over SMTP', {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    authenticated: config.smtpUser !== undefined,
  });
  return createSmtpMailer({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    user: config.smtpUser,
    password: config.smtpPassword,
    from: config.mailFrom,
  });
}
