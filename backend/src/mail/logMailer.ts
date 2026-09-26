import { logger } from '../utils/logger.js';
import type { Mailer } from './mailer.js';

/**
 * Writes the whole message to the log instead of sending it.
 *
 * This is what `npm run dev` gets when no SMTP_HOST is configured: without it,
 * creating a student on a machine with no mail server would produce an
 * activation link nobody could ever read. It logs the body — link included —
 * deliberately, which is why the composition root refuses to use it in
 * production (see config/env.ts: SMTP_HOST is required there).
 */
export function createLogMailer(): Mailer {
  return {
    kind: 'log',
    send(message) {
      logger.warn(
        'No SMTP server configured, so this e-mail was written to the log instead of sent',
        { to: message.to, subject: message.subject, text: message.text },
      );
      return Promise.resolve();
    },
  };
}
