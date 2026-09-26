import { describe, expect, it } from 'vitest';
import {
  accountTokenExpiry,
  accountTokenHashesMatch,
  generateAccountToken,
  hashAccountToken,
  looksLikeAccountToken,
  sessionCutoffSeconds,
  sessionIssuedAtSeconds,
  sessionPredatesPasswordChange,
} from './accountTokens.js';

describe('generateAccountToken', () => {
  it('produces a URL-safe token of at least 256 bits', () => {
    const token = generateAccountToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes as base64url, unpadded.
    expect(token).toHaveLength(43);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateAccountToken));
    expect(tokens.size).toBe(500);
  });
});

describe('hashAccountToken', () => {
  it('produces the lower-case hex SHA-256 the column checks for', () => {
    expect(hashAccountToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccountToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is stable for the same token and different for any other', () => {
    const token = generateAccountToken();
    expect(hashAccountToken(token)).toBe(hashAccountToken(token));
    expect(hashAccountToken(token)).not.toBe(hashAccountToken(generateAccountToken()));
  });

  it('cannot be reversed: the hash contains none of the token', () => {
    const token = generateAccountToken();
    expect(hashAccountToken(token)).not.toContain(token.slice(0, 8));
  });
});

describe('accountTokenHashesMatch', () => {
  it('matches a hash with itself and nothing else', () => {
    const hash = hashAccountToken('one');
    expect(accountTokenHashesMatch(hash, hash)).toBe(true);
    expect(accountTokenHashesMatch(hash, hashAccountToken('two'))).toBe(false);
  });

  it('returns false rather than throwing on different lengths', () => {
    expect(accountTokenHashesMatch('abc', hashAccountToken('abc'))).toBe(false);
  });
});

describe('looksLikeAccountToken', () => {
  it('accepts a generated token', () => {
    expect(looksLikeAccountToken(generateAccountToken())).toBe(true);
  });

  it('rejects empty, short, over-long and non-base64url input', () => {
    for (const value of ['', 'short', 'a'.repeat(129), 'has spaces', 'has/slash', 'plus+sign']) {
      expect(looksLikeAccountToken(value)).toBe(false);
    }
  });
});

describe('accountTokenExpiry', () => {
  it('adds the TTL in hours', () => {
    const now = new Date('2026-09-01T10:00:00.000Z');
    expect(accountTokenExpiry(now, 48).toISOString()).toBe('2026-09-03T10:00:00.000Z');
  });
});

/** A JWT iat: whole seconds, rounded down. */
const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe('sessionCutoffSeconds', () => {
  it('rounds a change up to the next whole second', () => {
    expect(sessionCutoffSeconds(new Date('2026-09-01T10:00:00.400Z'))).toBe(
      seconds('2026-09-01T10:00:01.000Z'),
    );
  });

  it('leaves a change exactly on a second where it is', () => {
    expect(sessionCutoffSeconds(new Date('2026-09-01T10:00:00.000Z'))).toBe(
      seconds('2026-09-01T10:00:00.000Z'),
    );
  });
});

describe('sessionPredatesPasswordChange', () => {
  it('refuses a token issued before the change', () => {
    expect(
      sessionPredatesPasswordChange(
        seconds('2026-09-01T09:59:59.000Z'),
        new Date('2026-09-01T10:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('keeps a token issued after the change', () => {
    expect(
      sessionPredatesPasswordChange(
        seconds('2026-09-01T10:00:05.000Z'),
        new Date('2026-09-01T10:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('refuses a token issued EARLIER in the same second as the change', () => {
    // The window this closes: an iat is rounded down, so a token minted at
    // .100 and a change at .400 both live in the same second. Rounding the
    // cut-off up is what stops the older one surviving the change.
    expect(
      sessionPredatesPasswordChange(
        seconds('2026-09-01T10:00:00.100Z'),
        new Date('2026-09-01T10:00:00.400Z'),
      ),
    ).toBe(true);
  });

  it('refuses the second before, however late in it the change happened', () => {
    expect(
      sessionPredatesPasswordChange(
        seconds('2026-09-01T09:59:59.000Z'),
        new Date('2026-09-01T10:00:00.999Z'),
      ),
    ).toBe(true);
  });
});

describe('sessionIssuedAtSeconds', () => {
  it("pushes a session created in the change's own second past the cut-off", () => {
    const changedAt = new Date('2026-09-01T10:00:00.400Z');
    const issuedAt = sessionIssuedAtSeconds(new Date('2026-09-01T10:00:00.450Z'), changedAt);

    // Without this, the very session activation hands back would be refused.
    expect(issuedAt).toBe(seconds('2026-09-01T10:00:01.000Z'));
    expect(sessionPredatesPasswordChange(issuedAt, changedAt)).toBe(false);
  });

  it('uses the current time when the change is safely in the past', () => {
    const now = new Date('2026-09-01T12:00:00.700Z');
    expect(sessionIssuedAtSeconds(now, new Date('2026-09-01T10:00:00.000Z'))).toBe(
      seconds('2026-09-01T12:00:00.000Z'),
    );
  });

  it('never issues a session its own account would reject', () => {
    // The two halves of the rule, checked against each other across a second.
    for (let offset = 0; offset < 1000; offset += 37) {
      const changedAt = new Date(`2026-09-01T10:00:00.${String(offset).padStart(3, '0')}Z`);
      const now = new Date(changedAt.getTime() + 5);
      expect(sessionPredatesPasswordChange(sessionIssuedAtSeconds(now, changedAt), changedAt)).toBe(
        false,
      );
    }
  });
});
