/**
 * The mailer interface, and the one thing every implementation must promise:
 * `send` either delivers the message or throws.
 *
 * Kept deliberately small. Every e-mail this application sends is plain text to
 * one recipient, so there is nothing here about HTML, attachments or templates.
 * The three implementations are the real SMTP one (mail/smtpMailer.ts), the
 * in-memory one the tests assert against (mail/memoryMailer.ts) and the logging
 * one used when no SMTP server is configured (mail/logMailer.ts).
 */

export interface EmailMessage {
  /** One recipient: these are all account e-mails, addressed to a person. */
  to: string;
  subject: string;
  /** Plain text. Links are written out in full, so they survive any client. */
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
  /** Named in logs and in the health output, e.g. "smtp" or "memory". */
  readonly kind: string;
}
