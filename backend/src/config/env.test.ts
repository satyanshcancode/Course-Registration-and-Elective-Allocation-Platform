import { describe, expect, it } from 'vitest';
import { appEnvSchema, EnvValidationError, parseEnv } from './env.js';

const validEnv = {
  DATABASE_URL: 'postgres://user:secret@localhost:5432/app',
  CORS_ORIGIN: 'http://localhost:5173, http://localhost:8080',
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
  });
});
