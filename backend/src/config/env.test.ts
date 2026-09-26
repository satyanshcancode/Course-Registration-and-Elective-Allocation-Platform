import { describe, expect, it } from 'vitest';
import { appEnvSchema, EnvValidationError, EXAMPLE_JWT_SECRET, parseEnv } from './env.js';

const STRONG_SECRET = 'k'.repeat(48);

const validEnv = {
  DATABASE_URL: 'postgres://user:secret@localhost:5432/app',
  CORS_ORIGIN: 'http://localhost:5173, http://localhost:8080',
  JWT_SECRET: STRONG_SECRET,
};

/** Production additionally requires a mail server (see the SMTP tests below). */
const validProductionEnv = { ...validEnv, NODE_ENV: 'production', SMTP_HOST: 'smtp.internal' };

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
      CSV_BODY_LIMIT: '2mb',
      JWT_SECRET: STRONG_SECRET,
      COOKIE_SECURE: false,
      APP_BASE_URL: 'http://localhost:5173',
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      MAIL_FROM: 'Course Registration <no-reply@university.edu>',
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

    expect(() =>
      parseEnv(appEnvSchema, { ...validProductionEnv, JWT_SECRET: EXAMPLE_JWT_SECRET }),
    ).toThrow(/JWT_SECRET: is still the example value/);
    expect(parseEnv(appEnvSchema, withExample).JWT_SECRET).toBe(EXAMPLE_JWT_SECRET);
  });

  it('makes cookies Secure in production unless explicitly disabled', () => {
    expect(parseEnv(appEnvSchema, validProductionEnv).COOKIE_SECURE).toBe(true);
    expect(
      parseEnv(appEnvSchema, { ...validProductionEnv, COOKIE_SECURE: 'false' }).COOKIE_SECURE,
    ).toBe(false);
  });

  it('strips a trailing slash from APP_BASE_URL, so links are built by concatenation', () => {
    expect(
      parseEnv(appEnvSchema, { ...validEnv, APP_BASE_URL: 'https://reg.example.edu/' })
        .APP_BASE_URL,
    ).toBe('https://reg.example.edu');
  });

  it('requires SMTP_HOST in production, but not in development', () => {
    expect(() => parseEnv(appEnvSchema, { ...validEnv, NODE_ENV: 'production' })).toThrow(
      /SMTP_HOST: is required in production/,
    );
    expect(parseEnv(appEnvSchema, validEnv).SMTP_HOST).toBeUndefined();
    expect(parseEnv(appEnvSchema, validProductionEnv).SMTP_HOST).toBe('smtp.internal');
  });

  // Docker Compose passes `${SMTP_USER:-}` as an empty string when .env has
  // no SMTP_USER, which is how the production stack refused to start against
  // a credential-free mail server.
  it('reads an empty SMTP setting as unset, not as a blank credential', () => {
    const env = parseEnv(appEnvSchema, {
      ...validProductionEnv,
      SMTP_USER: '',
      SMTP_PASSWORD: '',
    });

    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
  });

  it('still refuses half a credential when the other half is empty', () => {
    expect(() =>
      parseEnv(appEnvSchema, { ...validEnv, SMTP_USER: 'mailer', SMTP_PASSWORD: '' }),
    ).toThrow(/SMTP_PASSWORD: SMTP_USER and SMTP_PASSWORD must be set together/);
  });

  it('treats an empty SMTP_HOST as no mail server at all', () => {
    expect(parseEnv(appEnvSchema, { ...validEnv, SMTP_HOST: '' }).SMTP_HOST).toBeUndefined();
    expect(() => parseEnv(appEnvSchema, { ...validProductionEnv, SMTP_HOST: '' })).toThrow(
      /SMTP_HOST: is required in production/,
    );
  });

  it('refuses half an SMTP credential', () => {
    expect(() => parseEnv(appEnvSchema, { ...validEnv, SMTP_USER: 'mailer' })).toThrow(
      /SMTP_PASSWORD: SMTP_USER and SMTP_PASSWORD must be set together/,
    );
    expect(() => parseEnv(appEnvSchema, { ...validEnv, SMTP_PASSWORD: 'secret' })).toThrow(
      /SMTP_USER: SMTP_USER and SMTP_PASSWORD must be set together/,
    );
    expect(
      parseEnv(appEnvSchema, { ...validEnv, SMTP_USER: 'mailer', SMTP_PASSWORD: 'secret' })
        .SMTP_USER,
    ).toBe('mailer');
  });
});
