import { describe, expect, it } from 'vitest';
import { requiresStartTls } from './smtpMailer.js';

describe('requiresStartTls', () => {
  it('requires the upgrade whenever a credential would be sent in the clear', () => {
    // Brevo: smtp-relay.brevo.com:587, STARTTLS, authenticated.
    expect(requiresStartTls({ secure: false, user: 'login', password: 'key' })).toBe(true);
  });

  it('does not, on a port that is already encrypted', () => {
    // Port 465 is TLS from the first byte, so there is nothing to upgrade.
    expect(requiresStartTls({ secure: true, user: 'login', password: 'key' })).toBe(false);
  });

  it('does not when there is no credential to protect', () => {
    // Mailpit offers no TLS at all; requiring it would break the dev stack.
    expect(requiresStartTls({ secure: false, user: undefined, password: undefined })).toBe(false);
  });
});
