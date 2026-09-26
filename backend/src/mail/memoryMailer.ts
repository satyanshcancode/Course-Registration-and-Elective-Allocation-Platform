import type { EmailMessage, Mailer } from './mailer.js';

export interface MemoryMailer extends Mailer {
  /** Everything sent so far, oldest first. */
  readonly sent: readonly EmailMessage[];
  /** The most recent message to this address, or undefined. */
  lastTo(email: string): EmailMessage | undefined;
  clear(): void;
  /**
   * Makes the next `count` sends throw, so a test can prove that a failed
   * invitation does not leave a half-created account behind.
   */
  failNext(count?: number): void;
}

export class EmailDeliveryError extends Error {
  constructor() {
    super('Simulated e-mail delivery failure');
    this.name = 'EmailDeliveryError';
  }
}

/**
 * Collects messages instead of sending them. Used by every test that needs to
 * read an activation link, and by nothing else: the composition root only
 * builds it when NODE_ENV is 'test'.
 */
export function createMemoryMailer(): MemoryMailer {
  const sent: EmailMessage[] = [];
  let failures = 0;

  return {
    kind: 'memory',
    sent,
    async send(message) {
      if (failures > 0) {
        failures -= 1;
        // Await nothing, but keep the signature honest about being async.
        return Promise.reject(new EmailDeliveryError());
      }
      sent.push(message);
      return Promise.resolve();
    },
    lastTo(email) {
      const lower = email.toLowerCase();
      return sent.filter((message) => message.to.toLowerCase() === lower).at(-1);
    },
    clear() {
      sent.length = 0;
      failures = 0;
    },
    failNext(count = 1) {
      failures = count;
    },
  };
}
