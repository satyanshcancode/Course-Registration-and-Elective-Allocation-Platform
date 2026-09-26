/**
 * The account lifecycle end to end over HTTP: invitation, activation, password
 * reset, password change, session invalidation and deactivation.
 *
 * These are the security guarantees of the phase, so each one is asserted
 * against the real service graph and the real database rather than a stub:
 * single-use links, hashed storage, resend invalidating the old link, no
 * enumeration, rate limits, and a password change ending other sessions.
 */
import type {
  ActivationCheck,
  AdminStudentListItem,
  CreateStudentResult,
} from '@course-reg/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { SESSION_COOKIE_NAME } from '../../src/config/session.js';
import { createServices } from '../../src/container.js';
import { createMemoryMailer } from '../../src/mail/memoryMailer.js';
import { hashAccountToken } from '../../src/services/accountTokens.js';
import { RESET_REQUESTED_MESSAGE } from '../../src/services/accountService.js';
import {
  ACCOUNT_DEACTIVATED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
} from '../../src/services/authService.js';
import { createDepartment, createProgram, createUser } from './fixtures.js';
import {
  ALLOWED_ORIGIN,
  APP_BASE_URL,
  dataOf,
  JWT_SECRET,
  sessionFor,
  TEST_HASH_ROUNDS,
  tokenFromEmail,
} from './http.js';
import { getTestPool } from './testDatabase.js';

const STRONG_PASSWORD = 'correcthorsebatterystaple';
const OTHER_PASSWORD = 'anotherlongpassphrase42';

type App = ReturnType<typeof createApp>;

/** An app plus its mailer, with an admin and a programme ready to use. */
async function world(accountRateLimit?: { windowMs: number; limit: number }) {
  const pool = getTestPool();
  const mailer = createMemoryMailer();
  const app = createApp({
    corsOrigins: [ALLOWED_ORIGIN],
    jsonBodyLimit: '100kb',
    cookieSecure: false,
    ...(accountRateLimit && { accountRateLimit }),
    services: createServices(pool, {
      jwtSecret: JWT_SECRET,
      appBaseUrl: APP_BASE_URL,
      mailer,
      passwordHashRounds: TEST_HASH_ROUNDS,
    }),
  });
  const programId = await createProgram(pool, await createDepartment(pool));
  const adminId = await createUser(pool, { email: 'registrar@test.edu', role: 'ADMIN' });
  return { pool, app, mailer, programId, adminId };
}

/** The programme code the fixtures generated, whatever its number. */
async function programCode(pool = getTestPool()): Promise<string> {
  const result = await pool.query<{ code: string }>('SELECT code FROM programs LIMIT 1');
  return result.rows[0]?.code ?? '';
}

function post(app: App, path: string, body: unknown) {
  return request(app)
    .post(path)
    .set('Origin', ALLOWED_ORIGIN)
    .send(body as object);
}

// ---------------------------------------------------------------------------
// Invitation and activation
// ---------------------------------------------------------------------------

describe('invitation and activation', () => {
  it('e-mails a link whose token is stored only as a hash', async () => {
    const { app, mailer, adminId, pool } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());

    const email = mailer.lastTo(student.email);
    expect(email?.subject).toContain('Set up your course registration account');
    const token = tokenFromEmail(email?.text ?? '');

    // The token itself appears nowhere in the database; only its SHA-256 does.
    const stored = await pool.query<{ token_hash: string; purpose: string }>(
      'SELECT token_hash, purpose FROM account_tokens',
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.purpose).toBe('ACTIVATION');
    expect(stored.rows[0]?.token_hash).toBe(hashAccountToken(token));
    expect(stored.rows[0]?.token_hash).not.toBe(token);

    const raw = await pool.query<{ found: string }>(
      `SELECT count(*)::text AS found FROM account_tokens WHERE token_hash = $1`,
      [token],
    );
    expect(raw.rows[0]?.found).toBe('0');
  });

  it('says the account is still invited, with no password set', async () => {
    const { app, adminId, pool } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());

    expect(student.status).toBe('INVITED');
    expect(student.invitationPending).toBe(true);
    const stored = await pool.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE email = $1',
      [student.email],
    );
    expect(stored.rows[0]?.password_hash).toBeNull();
  });

  it('checks a live link and reports only the e-mail it belongs to', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');

    const response = await request(app).get(`/api/auth/activation/${token}`);

    expect(response.status).toBe(200);
    expect(dataOf(response)).toEqual({
      valid: true,
      email: student.email,
      purpose: 'ACTIVATION',
    });
  });

  it('sets the first password and signs the student in', async () => {
    const { app, mailer, adminId, pool } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');

    const response = await post(app, '/api/auth/activate', {
      token,
      password: STRONG_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(dataOf(response)).toMatchObject({ email: student.email, role: 'STUDENT' });
    // The session is in the cookie and nowhere else.
    expect(JSON.stringify(response.body)).not.toContain('cr_session');
    const setCookie: unknown = response.headers['set-cookie'];
    expect(String(setCookie)).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(String(setCookie)).toContain('HttpOnly');

    const stored = await pool.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE email = $1',
      [student.email],
    );
    // A real bcrypt hash of the chosen password, never the password itself.
    expect(stored.rows[0]?.password_hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(STRONG_PASSWORD, stored.rows[0]?.password_hash ?? '')).toBe(true);
  });

  it('lets the activated student sign in with the password they chose', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD });

    const login = await post(app, '/api/auth/login', {
      email: student.email,
      password: STRONG_PASSWORD,
    });

    expect(login.status).toBe(200);
    expect(dataOf(login)).toMatchObject({ email: student.email });
  });

  it('spends the link: the same token cannot be used twice', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');

    expect(
      (await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD })).status,
    ).toBe(200);
    const second = await post(app, '/api/auth/activate', { token, password: OTHER_PASSWORD });

    expect(second.status).toBe(400);
    expect((second.body as { message: string }).message).toMatch(/no longer usable/i);
    // The second attempt changed nothing: the first password still works.
    const login = await post(app, '/api/auth/login', {
      email: student.email,
      password: STRONG_PASSWORD,
    });
    expect(login.status).toBe(200);
  });

  it('reports a spent link the same way it reports an unknown one', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD });

    const spent = await request(app).get(`/api/auth/activation/${token}`);
    const unknown = await request(app).get(`/api/auth/activation/${'z'.repeat(43)}`);

    // Same status and same body: a guess learns nothing from either.
    expect(spent.status).toBe(200);
    expect(unknown.status).toBe(200);
    const expected: ActivationCheck = { valid: false, reason: 'unusable' };
    expect(dataOf(spent)).toEqual(expected);
    expect(dataOf(unknown)).toEqual(expected);
  });

  it('refuses an expired link', async () => {
    const { app, mailer, adminId, pool } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    // Backdated rather than waiting 48 hours. BOTH timestamps move, because
    // account_tokens_expires_after_created_check would (rightly) reject an
    // expiry that precedes the row's own creation.
    await pool.query(
      `UPDATE account_tokens
       SET created_at = now() - interval '49 hours',
           expires_at = now() - interval '1 hour'`,
    );

    const check = await request(app).get(`/api/auth/activation/${token}`);
    const activate = await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD });

    expect(dataOf(check)).toEqual({ valid: false, reason: 'unusable' });
    expect(activate.status).toBe(400);
  });

  it('refuses a password below the minimum length', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');

    const response = await post(app, '/api/auth/activate', { token, password: 'short1' });

    expect(response.status).toBe(400);
    expect((response.body as { errors?: { field: string }[] }).errors?.[0]?.field).toBe('password');
    // And the link is NOT spent by a rejected attempt.
    expect(dataOf(await request(app).get(`/api/auth/activation/${token}`))).toMatchObject({
      valid: true,
    });
  });

  it('accepts a long passphrase with no digits or punctuation', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');

    expect(
      (await post(app, '/api/auth/activate', { token, password: 'a'.repeat(10) })).status,
    ).toBe(200);
  });

  it('records the activation in the audit log', async () => {
    const { app, mailer, adminId, pool } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD });

    const audit = await pool.query<{ action: string }>(
      `SELECT action FROM audit_logs ORDER BY created_at`,
    );
    expect(audit.rows.map((row) => row.action)).toContain('ACCOUNT_ACTIVATED');
    expect(audit.rows.map((row) => row.action)).toContain('STUDENT_INVITED');
  });
});

/** inviteStudent, with the programme code the fixtures actually generated. */
async function inviteStudentWithProgram(
  app: App,
  adminId: string,
  program: string,
  overrides: { rollNumber?: string; email?: string } = {},
): Promise<AdminStudentListItem> {
  const response = await request(app)
    .post('/api/admin/students')
    .set('Origin', ALLOWED_ORIGIN)
    .set('Cookie', sessionFor(adminId, 'ADMIN'))
    .send({
      rollNumber: overrides.rollNumber ?? 'CSE26001',
      name: 'Asha Menon',
      email: overrides.email ?? 'asha.menon@test.edu',
      program,
      semester: 5,
      creditsCompleted: 88,
      expectedGraduationTerm: '2028-SPRING',
      completedCourses: [],
    });
  expect(response.status).toBe(201);
  return (dataOf(response) as CreateStudentResult).student;
}

// ---------------------------------------------------------------------------
// Resending an invitation
// ---------------------------------------------------------------------------

describe('resending an invitation', () => {
  it('invalidates the previous link', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const first = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');

    const resend = await request(app)
      .post(`/api/admin/students/${student.rollNumber}/invitation`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', sessionFor(adminId, 'ADMIN'))
      .send({});
    expect(resend.status).toBe(200);

    const second = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    expect(second).not.toBe(first);

    // The old link is dead; the new one works.
    expect(dataOf(await request(app).get(`/api/auth/activation/${first}`))).toEqual({
      valid: false,
      reason: 'unusable',
    });
    expect(
      (await post(app, '/api/auth/activate', { token: first, password: STRONG_PASSWORD })).status,
    ).toBe(400);
    expect(
      (await post(app, '/api/auth/activate', { token: second, password: STRONG_PASSWORD })).status,
    ).toBe(200);
  });

  it('says so in the e-mail, so the recipient knows which link to use', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    await request(app)
      .post(`/api/admin/students/${student.rollNumber}/invitation`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', sessionFor(adminId, 'ADMIN'))
      .send({});

    const email = mailer.lastTo(student.email);
    expect(email?.subject).toContain('new course registration invitation');
    expect(email?.text).toContain('Any earlier link no longer works');
  });

  it('refuses to invite a student who has already set a password', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD });

    const resend = await request(app)
      .post(`/api/admin/students/${student.rollNumber}/invitation`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', sessionFor(adminId, 'ADMIN'))
      .send({});

    expect(resend.status).toBe(400);
    expect((resend.body as { message: string }).message).toMatch(/password reset instead/i);
  });
});

// ---------------------------------------------------------------------------
// Forgot password: the same answer for every address
// ---------------------------------------------------------------------------

describe('POST /api/auth/forgot-password', () => {
  /** An activated student, ready to forget their password. */
  async function activated(
    app: App,
    adminId: string,
    mailer: ReturnType<typeof createMemoryMailer>,
  ) {
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD });
    mailer.clear();
    return student;
  }

  it('answers identically for a known and an unknown address', async () => {
    const { app, mailer, adminId } = await world();
    const student = await activated(app, adminId, mailer);

    const known = await post(app, '/api/auth/forgot-password', { email: student.email });
    const unknown = await post(app, '/api/auth/forgot-password', {
      email: 'nobody@test.edu',
    });

    // Same status, same body, byte for byte: nothing distinguishes them.
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect((known.body as { message: string }).message).toBe(RESET_REQUESTED_MESSAGE);
  });

  it('e-mails a link only to an address that exists', async () => {
    const { app, mailer, adminId } = await world();
    const student = await activated(app, adminId, mailer);

    await post(app, '/api/auth/forgot-password', { email: 'nobody@test.edu' });
    expect(mailer.sent).toHaveLength(0);

    await post(app, '/api/auth/forgot-password', { email: student.email });
    expect(mailer.lastTo(student.email)?.subject).toContain('Reset your course registration');
  });

  it('answers the same way when sending the e-mail fails', async () => {
    const { app, mailer, adminId } = await world();
    const student = await activated(app, adminId, mailer);
    // A mail outage must not become a way of discovering which addresses exist.
    mailer.failNext();

    const failed = await post(app, '/api/auth/forgot-password', { email: student.email });
    const unknown = await post(app, '/api/auth/forgot-password', { email: 'nobody@test.edu' });

    expect(failed.status).toBe(200);
    expect(failed.body).toEqual(unknown.body);
  });

  it('sends nothing for an account that has never been activated', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    mailer.clear();

    const response = await post(app, '/api/auth/forgot-password', { email: student.email });

    // There is no password to reset yet: the invitation is the way in.
    expect(response.status).toBe(200);
    expect(mailer.sent).toHaveLength(0);
  });

  it('sends nothing for a deactivated account', async () => {
    const { app, mailer, adminId } = await world();
    const student = await activated(app, adminId, mailer);
    await request(app)
      .post(`/api/admin/students/${student.rollNumber}/deactivate`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', sessionFor(adminId, 'ADMIN'))
      .send({});
    mailer.clear();

    expect((await post(app, '/api/auth/forgot-password', { email: student.email })).status).toBe(
      200,
    );
    expect(mailer.sent).toHaveLength(0);
  });

  it('rejects a malformed address without revealing anything else', async () => {
    const { app } = await world();
    const response = await post(app, '/api/auth/forgot-password', { email: 'not-an-email' });
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

describe('POST /api/auth/reset-password', () => {
  /** An activated student with a live reset link. */
  async function withResetLink(
    app: App,
    adminId: string,
    mailer: ReturnType<typeof createMemoryMailer>,
  ) {
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const invitation = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    await post(app, '/api/auth/activate', { token: invitation, password: STRONG_PASSWORD });
    mailer.clear();
    await post(app, '/api/auth/forgot-password', { email: student.email });
    return { student, token: tokenFromEmail(mailer.lastTo(student.email)?.text ?? '') };
  }

  it('replaces the password and signs the student in', async () => {
    const { app, mailer, adminId } = await world();
    const { student, token } = await withResetLink(app, adminId, mailer);

    const response = await post(app, '/api/auth/reset-password', {
      token,
      password: OTHER_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(dataOf(response)).toMatchObject({ email: student.email });
    expect(
      (await post(app, '/api/auth/login', { email: student.email, password: OTHER_PASSWORD }))
        .status,
    ).toBe(200);
    // The old password no longer works.
    expect(
      (await post(app, '/api/auth/login', { email: student.email, password: STRONG_PASSWORD }))
        .status,
    ).toBe(401);
  });

  it('spends the link, so it cannot be replayed', async () => {
    const { app, mailer, adminId } = await world();
    const { token } = await withResetLink(app, adminId, mailer);

    expect(
      (await post(app, '/api/auth/reset-password', { token, password: OTHER_PASSWORD })).status,
    ).toBe(200);
    expect(
      (await post(app, '/api/auth/reset-password', { token, password: 'thirdpassword1' })).status,
    ).toBe(400);
  });

  it('refuses an ACTIVATION link at the reset endpoint, and the other way round', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const invitation = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');

    // An activation token is not a reset token, however valid it is.
    expect(
      (await post(app, '/api/auth/reset-password', { token: invitation, password: OTHER_PASSWORD }))
        .status,
    ).toBe(400);

    await post(app, '/api/auth/activate', { token: invitation, password: STRONG_PASSWORD });
    mailer.clear();
    await post(app, '/api/auth/forgot-password', { email: student.email });
    const reset = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');

    expect(
      (await post(app, '/api/auth/activate', { token: reset, password: OTHER_PASSWORD })).status,
    ).toBe(400);
  });

  it('tells the owner their password changed', async () => {
    const { app, mailer, adminId } = await world();
    const { student, token } = await withResetLink(app, adminId, mailer);
    mailer.clear();

    await post(app, '/api/auth/reset-password', { token, password: OTHER_PASSWORD });

    const notice = mailer.lastTo(student.email);
    expect(notice?.subject).toContain('password was changed');
    // The warning carries no link, so it cannot itself be used to take over.
    expect(notice?.text).not.toMatch(/token=/);
  });
});

// ---------------------------------------------------------------------------
// Session invalidation
// ---------------------------------------------------------------------------

describe('a password change ends other sessions', () => {
  /**
   * Waits until the wall clock crosses into the next second.
   *
   * The cut-off is compared against a JWT's `iat`, which is whole seconds, so
   * two events inside ONE second cannot be ordered by it — a real sign-in and a
   * real password change are never that close, but a test is. Crossing the
   * boundary makes the sign-in genuinely older than the change, which is the
   * situation the guarantee is about. It is a real wait, not a fake timer,
   * because the cut-off is written by the DATABASE's now().
   */
  async function nextSecond(): Promise<void> {
    const remaining = 1000 - (Date.now() % 1000);
    await new Promise((resolve) => setTimeout(resolve, remaining + 50));
  }

  async function activatedWithSession(
    app: App,
    adminId: string,
    mailer: ReturnType<typeof createMemoryMailer>,
  ) {
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    const activation = await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD });
    const userId = (dataOf(activation) as { id: string }).id;
    // A second device: an independent session for the same account.
    const login = await post(app, '/api/auth/login', {
      email: student.email,
      password: STRONG_PASSWORD,
    });
    const cookies: unknown = login.headers['set-cookie'];
    const other =
      (Array.isArray(cookies) ? cookies : [])
        .filter((cookie): cookie is string => typeof cookie === 'string')
        .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.split(';')[0] ?? '';
    return { student, userId, otherDevice: other };
  }

  it('refuses the other device after a reset, and keeps this one signed in', async () => {
    const { app, mailer, adminId } = await world();
    const { student, otherDevice } = await activatedWithSession(app, adminId, mailer);

    // The other device works before the reset.
    expect((await request(app).get('/api/auth/me').set('Cookie', otherDevice)).status).toBe(200);

    await nextSecond();
    mailer.clear();
    await post(app, '/api/auth/forgot-password', { email: student.email });
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    const reset = await post(app, '/api/auth/reset-password', { token, password: OTHER_PASSWORD });

    // The old cookie is refused; the cookie the reset itself returned works.
    expect((await request(app).get('/api/auth/me').set('Cookie', otherDevice)).status).toBe(401);
    const fresh: unknown = reset.headers['set-cookie'];
    const freshCookie =
      (Array.isArray(fresh) ? fresh : [])
        .filter((cookie): cookie is string => typeof cookie === 'string')
        .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.split(';')[0] ?? '';
    expect((await request(app).get('/api/auth/me').set('Cookie', freshCookie)).status).toBe(200);
  });

  it('refuses the other device after a deliberate change, and keeps this one', async () => {
    const { app, mailer, adminId } = await world();
    const { otherDevice } = await activatedWithSession(app, adminId, mailer);
    await nextSecond();

    const change = await request(app)
      .put('/api/account/password')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', otherDevice)
      .send({ currentPassword: STRONG_PASSWORD, newPassword: OTHER_PASSWORD });
    expect(change.status).toBe(200);

    // The cookie that MADE the change is replaced, so this device stays in.
    const fresh: unknown = change.headers['set-cookie'];
    const freshCookie =
      (Array.isArray(fresh) ? fresh : [])
        .filter((cookie): cookie is string => typeof cookie === 'string')
        .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.split(';')[0] ?? '';
    expect((await request(app).get('/api/auth/me').set('Cookie', freshCookie)).status).toBe(200);
    // The pre-change cookie is refused.
    expect((await request(app).get('/api/auth/me').set('Cookie', otherDevice)).status).toBe(401);
  });

  it('refuses a session issued before the cut-off, whatever else is valid about it', async () => {
    const { app, mailer, adminId, pool } = await world();
    const { userId } = await activatedWithSession(app, adminId, mailer);
    // A token that is perfectly signed and unexpired, but predates the change.
    const stale = sessionFor(userId, 'STUDENT');
    await pool.query(`UPDATE users SET password_changed_at = now() + interval '1 minute'`);

    expect((await request(app).get('/api/auth/me').set('Cookie', stale)).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Changing a password while signed in
// ---------------------------------------------------------------------------

describe('PUT /api/account/password', () => {
  async function signedInStudent(
    app: App,
    adminId: string,
    mailer: ReturnType<typeof createMemoryMailer>,
  ) {
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    const activation = await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD });
    const cookies: unknown = activation.headers['set-cookie'];
    const cookie =
      (Array.isArray(cookies) ? cookies : [])
        .filter((value): value is string => typeof value === 'string')
        .find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.split(';')[0] ?? '';
    return { student, cookie };
  }

  const change = (app: App, cookie: string, body: unknown) =>
    request(app)
      .put('/api/account/password')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', cookie)
      .send(body as object);

  it('needs the current password', async () => {
    const { app, mailer, adminId } = await world();
    const { student, cookie } = await signedInStudent(app, adminId, mailer);

    const response = await change(app, cookie, {
      currentPassword: 'not-the-password',
      newPassword: OTHER_PASSWORD,
    });

    expect(response.status).toBe(400);
    expect((response.body as { errors?: { field: string }[] }).errors?.[0]?.field).toBe(
      'currentPassword',
    );
    // Nothing changed: the original password still signs in.
    expect(
      (await post(app, '/api/auth/login', { email: student.email, password: STRONG_PASSWORD }))
        .status,
    ).toBe(200);
  });

  it('refuses reusing the current password', async () => {
    const { app, mailer, adminId } = await world();
    const { cookie } = await signedInStudent(app, adminId, mailer);

    const response = await change(app, cookie, {
      currentPassword: STRONG_PASSWORD,
      newPassword: STRONG_PASSWORD,
    });

    expect(response.status).toBe(400);
    expect((response.body as { errors?: { field: string }[] }).errors?.[0]?.field).toBe(
      'newPassword',
    );
  });

  it('refuses a new password below the minimum length', async () => {
    const { app, mailer, adminId } = await world();
    const { cookie } = await signedInStudent(app, adminId, mailer);

    expect(
      (await change(app, cookie, { currentPassword: STRONG_PASSWORD, newPassword: 'short' }))
        .status,
    ).toBe(400);
  });

  it('is refused without a session', async () => {
    const { app } = await world();
    expect(
      (await change(app, '', { currentPassword: STRONG_PASSWORD, newPassword: OTHER_PASSWORD }))
        .status,
    ).toBe(401);
  });

  it('works for an administrator too', async () => {
    const { app, adminId, pool } = await world();
    // Give the admin a known password, then change it through the endpoint.
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
      adminId,
      await bcrypt.hash(STRONG_PASSWORD, TEST_HASH_ROUNDS),
    ]);
    const login = await post(app, '/api/auth/login', {
      email: 'registrar@test.edu',
      password: STRONG_PASSWORD,
    });
    const cookies: unknown = login.headers['set-cookie'];
    const cookie =
      (Array.isArray(cookies) ? cookies : [])
        .filter((value): value is string => typeof value === 'string')
        .find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.split(';')[0] ?? '';

    const response = await change(app, cookie, {
      currentPassword: STRONG_PASSWORD,
      newPassword: OTHER_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(dataOf(response)).toMatchObject({ role: 'ADMIN' });
  });

  it('spends an outstanding reset link', async () => {
    const { app, mailer, adminId } = await world();
    const { student, cookie } = await signedInStudent(app, adminId, mailer);
    mailer.clear();
    await post(app, '/api/auth/forgot-password', { email: student.email });
    const resetToken = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');

    await change(app, cookie, {
      currentPassword: STRONG_PASSWORD,
      newPassword: OTHER_PASSWORD,
    });

    // A link requested before the change must not still work after it.
    expect(
      (await post(app, '/api/auth/reset-password', { token: resetToken, password: 'thirdpass12' }))
        .status,
    ).toBe(400);
  });

  it('records the change in the audit log', async () => {
    const { app, mailer, adminId, pool } = await world();
    const { cookie } = await signedInStudent(app, adminId, mailer);

    await change(app, cookie, { currentPassword: STRONG_PASSWORD, newPassword: OTHER_PASSWORD });

    const audit = await pool.query<{ action: string }>('SELECT action FROM audit_logs');
    expect(audit.rows.map((row) => row.action)).toContain('PASSWORD_CHANGED');
  });
});

// ---------------------------------------------------------------------------
// Inactive accounts
// ---------------------------------------------------------------------------

describe('deactivated accounts', () => {
  async function deactivatedStudent(
    app: App,
    adminId: string,
    mailer: ReturnType<typeof createMemoryMailer>,
  ) {
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    const activation = await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD });
    const userId = (dataOf(activation) as { id: string }).id;
    const cookies: unknown = activation.headers['set-cookie'];
    const cookie =
      (Array.isArray(cookies) ? cookies : [])
        .filter((value): value is string => typeof value === 'string')
        .find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.split(';')[0] ?? '';

    const response = await request(app)
      .post(`/api/admin/students/${student.rollNumber}/deactivate`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', sessionFor(adminId, 'ADMIN'))
      .send({ reason: 'Left the programme' });
    expect(response.status).toBe(200);
    return { student, userId, cookie };
  }

  it('cannot sign in, and is told why rather than doubting the password', async () => {
    const { app, mailer, adminId } = await world();
    const { student } = await deactivatedStudent(app, adminId, mailer);

    const response = await post(app, '/api/auth/login', {
      email: student.email,
      password: STRONG_PASSWORD,
    });

    // 403, not 401: only somebody who typed the RIGHT password sees this, so it
    // reveals nothing to a guesser.
    expect(response.status).toBe(403);
    expect((response.body as { message: string }).message).toBe(ACCOUNT_DEACTIVATED_MESSAGE);
  });

  it('still answers a wrong password with the generic message', async () => {
    const { app, mailer, adminId } = await world();
    const { student } = await deactivatedStudent(app, adminId, mailer);

    const response = await post(app, '/api/auth/login', {
      email: student.email,
      password: 'wrong-password',
    });

    expect(response.status).toBe(401);
    expect((response.body as { message: string }).message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('ends the open session on the next request', async () => {
    const { app, mailer, adminId } = await world();
    const { cookie } = await deactivatedStudent(app, adminId, mailer);

    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('keeps the student record and every history row', async () => {
    const { app, mailer, adminId, pool } = await world();
    const { student, userId } = await deactivatedStudent(app, adminId, mailer);

    const kept = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM students WHERE user_id = $1`,
      [userId],
    );
    expect(kept.rows[0]?.count).toBe('1');
    // And the admin can still see them, marked INACTIVE.
    const detail = await request(app)
      .get(`/api/admin/students/${student.rollNumber}`)
      .set('Cookie', sessionFor(adminId, 'ADMIN'));
    expect(detail.status).toBe(200);
    expect(dataOf(detail)).toMatchObject({ student: { status: 'INACTIVE' } });
  });

  it('can be reactivated and sign in again with the same password', async () => {
    const { app, mailer, adminId } = await world();
    const { student } = await deactivatedStudent(app, adminId, mailer);

    const response = await request(app)
      .post(`/api/admin/students/${student.rollNumber}/reactivate`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', sessionFor(adminId, 'ADMIN'))
      .send({});
    expect(response.status).toBe(200);

    expect(
      (await post(app, '/api/auth/login', { email: student.email, password: STRONG_PASSWORD }))
        .status,
    ).toBe(200);
  });

  it('records both changes in the audit log with their reason', async () => {
    const { app, mailer, adminId, pool } = await world();
    const { student } = await deactivatedStudent(app, adminId, mailer);
    await request(app)
      .post(`/api/admin/students/${student.rollNumber}/reactivate`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', sessionFor(adminId, 'ADMIN'))
      .send({});

    const audit = await pool.query<{ action: string; reason: string | null }>(
      `SELECT action, reason FROM audit_logs WHERE action LIKE 'STUDENT_%ACTIVATED' ORDER BY created_at`,
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'STUDENT_DEACTIVATED',
      'STUDENT_REACTIVATED',
    ]);
    expect(audit.rows[0]?.reason).toBe('Left the programme');
  });

  it('refuses to activate an account that was deactivated while invited', async () => {
    const { app, mailer, adminId } = await world();
    const student = await inviteStudentWithProgram(app, adminId, await programCode());
    const token = tokenFromEmail(mailer.lastTo(student.email)?.text ?? '');
    await request(app)
      .post(`/api/admin/students/${student.rollNumber}/deactivate`)
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', sessionFor(adminId, 'ADMIN'))
      .send({});

    expect(dataOf(await request(app).get(`/api/auth/activation/${token}`))).toEqual({
      valid: false,
      reason: 'unusable',
    });
    expect(
      (await post(app, '/api/auth/activate', { token, password: STRONG_PASSWORD })).status,
    ).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

describe('rate limits on the public account endpoints', () => {
  it('answers 429 once the budget is spent, and counts successes', async () => {
    const { app } = await world({ windowMs: 60_000, limit: 3 });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await post(app, '/api/auth/forgot-password', { email: 'nobody@test.edu' });
      // Successes count here, unlike sign-in: sending mail is work either way,
      // and a "success" says nothing about whether anything happened.
      expect(response.status).toBe(200);
    }
    const blocked = await post(app, '/api/auth/forgot-password', { email: 'nobody@test.edu' });

    expect(blocked.status).toBe(429);
    expect((blocked.body as { message: string }).message).toMatch(/Too many requests/);
  });

  it('shares one budget across the account endpoints, keyed on the IP alone', async () => {
    const { app } = await world({ windowMs: 60_000, limit: 2 });

    await post(app, '/api/auth/forgot-password', { email: 'one@test.edu' });
    // A DIFFERENT address: keying on the e-mail would make the limiter itself
    // an oracle for which addresses exist.
    await post(app, '/api/auth/forgot-password', { email: 'two@test.edu' });

    expect((await request(app).get(`/api/auth/activation/${'z'.repeat(43)}`)).status).toBe(429);
    expect(
      (await post(app, '/api/auth/activate', { token: 'z'.repeat(43), password: STRONG_PASSWORD }))
        .status,
    ).toBe(429);
  });

  it('does not limit signing in through the account budget', async () => {
    const { app } = await world({ windowMs: 60_000, limit: 1 });
    await post(app, '/api/auth/forgot-password', { email: 'nobody@test.edu' });

    // /auth/login has its own, separate limiter.
    const login = await post(app, '/api/auth/login', {
      email: 'nobody@test.edu',
      password: 'whatever12',
    });
    expect(login.status).toBe(401);
  });
});
