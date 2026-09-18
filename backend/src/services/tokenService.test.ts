import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { createTokenService } from './tokenService.js';

const SECRET = 's'.repeat(40);
const tokens = createTokenService({ secret: SECRET, ttlSeconds: 60 });
const claims = { userId: '6f1c9a9e-2d1b-4b4a-9a55-2b9f0a1c0d11', role: 'STUDENT' } as const;

describe('tokenService', () => {
  it('round-trips user id and role only', () => {
    const token = tokens.sign(claims);
    const decoded = jwt.decode(token);

    expect(tokens.verify(token)).toEqual(claims);
    expect(decoded).toEqual({
      sub: claims.userId,
      role: 'STUDENT',
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    });
  });

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign({ role: 'ADMIN' }, 'x'.repeat(40), { subject: claims.userId });
    expect(tokens.verify(forged)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const [header, , signature] = tokens.sign(claims).split('.');
    const payload = Buffer.from(JSON.stringify({ sub: claims.userId, role: 'ADMIN' })).toString(
      'base64url',
    );
    expect(tokens.verify(`${header ?? ''}.${payload}.${signature ?? ''}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ role: 'STUDENT', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, {
      subject: claims.userId,
    });
    expect(tokens.verify(expired)).toBeNull();
  });

  it('rejects unsigned ("alg: none") tokens and unknown roles', () => {
    const unsigned = jwt.sign({ role: 'ADMIN' }, '', { algorithm: 'none', subject: claims.userId });
    const unknownRole = jwt.sign({ role: 'ROOT' }, SECRET, { subject: claims.userId });

    expect(tokens.verify(unsigned)).toBeNull();
    expect(tokens.verify(unknownRole)).toBeNull();
    expect(tokens.verify('not-a-jwt')).toBeNull();
  });
});
