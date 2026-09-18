import { describe, expect, it } from 'vitest';
import { appEnvSchema, EnvValidationError, EXAMPLE_JWT_SECRET, parseEnv } from './env.js';

const STRONG_SECRET = 'k'.repeat(48);

const validEnv = {
  DATABASE_URL: 'postgres://user:secret@localhost:5432/app',
  CORS_ORIGIN: 'http://localhost:5173, http://localhost:8080',
  JWT_SECRET: STRONG_SECRET,
};

describe('parseEnv', () => {
  it('applies defaults and normalises values', () => {
    const env = parseEnv(appEnvSchema, validEnv);

    expect(env).toEqual({
      NODE_ENV: 'development',
      DATABASE_URL: validEnv.DATABASE_URL,
      LOG_LEVEL: 'info',
      PORT: 4000,
      CORS_ORIGIN: ['http://localhost:5173', 'http://localhost:8080'],
      JSON_BODY_LIMIT: '100kb',
      JWT_SECRET: STRONG_SECRET,
      COOKIE_SECURE: false,
    });
  });

  it('coerces PORT from a string', () => {
    expect(parseEnv(appEnvSchema, { ...validEnv, PORT: '5000' }).PORT).toBe(5000);
  });

  it('fails fast listing every missing or invalid variable', () => {
    const attempt = () => parseEnv(appEnvSchema, { DATABASE_URL: 'mysql://x', PORT: 'abc' });

    expect(attempt).toThrow(EnvValidationError);
    expect(attempt).toThrow(/DATABASE_URL/);
    expect(attempt).toThrow(/CORS_ORIGIN/);
    expect(attempt).toThrow(/PORT/);
    expect(attempt).toThrow(/JWT_SECRET/);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => parseEnv(appEnvSchema, { ...validEnv, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET: must be at least 32 characters/,
    );
  });

  it('refuses the example JWT secret in production, but allows it in development', () => {
    const withExample = { ...validEnv, JWT_SECRET: EXAMPLE_JWT_SECRET };

    expect(() => parseEnv(appEnvSchema, { ...withExample, NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET: is still the example value/,
    );
    expect(parseEnv(appEnvSchema, withExample).JWT_SECRET).toBe(EXAMPLE_JWT_SECRET);
  });

  it('makes cookies Secure in production unless explicitly disabled', () => {
    expect(parseEnv(appEnvSchema, { ...validEnv, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(
      true,
    );
    expect(
      parseEnv(appEnvSchema, { ...validEnv, NODE_ENV: 'production', COOKIE_SECURE: 'false' })
        .COOKIE_SECURE,
    ).toBe(false);
  });
});
