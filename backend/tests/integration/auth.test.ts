/**
 * Authentication and authorization end to end over HTTP, against the test
 * database, using the real service graph from container.ts.
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { SESSION_COOKIE_NAME } from '../../src/config/session.js';
import { createServices } from '../../src/container.js';
import { createMemoryMailer } from '../../src/mail/memoryMailer.js';
import { INVALID_CREDENTIALS_MESSAGE } from '../../src/services/authService.js';
import {
  createDepartment,
  createProgram,
  createStudent,
  createUser,
  TEST_PASSWORD,
  TEST_PASSWORD_HASH,
} from './fixtures.js';
import { getTestPool } from './testDatabase.js';

const JWT_SECRET = 'integration-test-secret-that-is-long-enough-123';
const ALLOWED_ORIGIN = 'http://localhost:5173';

function buildApp(loginRateLimit = { windowMs: 60_000, limit: 10 }) {
  return createApp({
    corsOrigins: [ALLOWED_ORIGIN],
    jsonBodyLimit: '100kb',
    cookieSecure: false,
    loginRateLimit,
    services: createServices(getTestPool(), {
      jwtSecret: JWT_SECRET,
      appBaseUrl: 'http://localhost:5173',
      mailer: createMemoryMailer(),
      passwordHashRounds: 4,
    }),
  });
}

async function createAccounts() {
  const pool = getTestPool();
  const programId = await createProgram(pool, await createDepartment(pool));
  const adminId = await createUser(pool, { email: 'admin@test.edu', role: 'ADMIN' });
  const studentId = await createStudent(pool, programId, {
    userId: await createUser(pool, { email: 'ada@test.edu' }),
  });
  const otherStudentId = await createStudent(pool, programId, {
    userId: await createUser(pool, { email: 'grace@test.edu' }),
  });
  return { adminId, studentId, otherStudentId };
}

function login(app: ReturnType<typeof buildApp>, email: string, password = TEST_PASSWORD) {
  return request(app)
    .post('/api/auth/login')
    .set('Origin', ALLOWED_ORIGIN)
    .send({ email, password });
}

/** The raw Set-Cookie header for the session cookie. */
function sessionSetCookie(response: request.Response): string {
  const header: unknown = response.headers['set-cookie'];
  const cookies = Array.isArray(header)
    ? header.filter((c): c is string => typeof c === 'string')
    : [];
  return cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? '';
}

/** "name=value" to send back in a Cookie header. */
function sessionCookie(response: request.Response): string {
  return sessionSetCookie(response).split(';')[0] ?? '';
}

/** The ApiResponse `data` field (supertest types the body as any). */
function dataOf(response: request.Response): unknown {
  return (response.body as { data?: unknown }).data;
}

function tokenFor(userId: string, role: string, options: jwt.SignOptions = {}): string {
  return jwt.sign({ role }, JWT_SECRET, { subject: userId, expiresIn: '1h', ...options });
}

describe('POST /api/auth/login', () => {
  it('sets an httpOnly, SameSite=Strict session cookie and returns no token in the body', async () => {
    await createAccounts();
    const response = await login(buildApp(), 'ada@test.edu');

    expect(response.status).toBe(200);
    const setCookie = sessionSetCookie(response);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\/api/);
    expect(setCookie).toMatch(/Max-Age=28800/);
    expect(setCookie).not.toMatch(/Secure/i);

    const token = sessionCookie(response).split('=')[1] ?? '';
    expect(token.length).toBeGreaterThan(20);
    expect(response.text).not.toContain(token);
    expect(response.text).not.toMatch(/token/i);
    expect(response.body).toMatchObject({
      success: true,
      data: { email: 'ada@test.edu', role: 'STUDENT', student: { semester: 5 } },
    });
  });

  it('marks the cookie Secure when configured for production', async () => {
    await createAccounts();
    const app = createApp({
      corsOrigins: [ALLOWED_ORIGIN],
      jsonBodyLimit: '100kb',
      cookieSecure: true,
      services: createServices(getTestPool(), {
        jwtSecret: JWT_SECRET,
        appBaseUrl: 'http://localhost:5173',
        mailer: createMemoryMailer(),
        passwordHashRounds: 4,
      }),
    });

    expect(sessionSetCookie(await login(app, 'ada@test.edu'))).toMatch(/; Secure/);
  });

  it('matches e-mail addresses case-insensitively', async () => {
    await createAccounts();
    expect((await login(buildApp(), '  ADA@Test.EDU ')).status).toBe(200);
  });

  it('returns the identical 401 for a wrong password and an unknown e-mail', async () => {
    await createAccounts();
    const app = buildApp();
    const wrongPassword = await login(app, 'ada@test.edu', 'not-the-password');
    const unknownEmail = await login(app, 'nobody@test.edu', 'not-the-password');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual({
      success: false,
      data: null,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(sessionSetCookie(wrongPassword)).toBe('');
  });

  it('rejects malformed input with field errors', async () => {
    const response = await login(buildApp(), 'not-an-email', '');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      errors: [
        { field: 'email', message: 'Enter a valid e-mail address.' },
        { field: 'password', message: 'Password is required.' },
      ],
    });
  });

  it('rate-limits repeated failures per IP and e-mail with a 429 ApiResponse', async () => {
    await createAccounts();
    const app = buildApp({ windowMs: 60_000, limit: 3 });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await login(app, 'ada@test.edu', 'wrong')).status).toBe(401);
    }

    const limited = await login(app, 'ada@test.edu', TEST_PASSWORD);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      success: false,
      data: null,
      message: 'Too many sign-in attempts. Please wait 1 minutes and try again.',
    });
    expect(limited.headers['ratelimit-policy']).toBeDefined();
    // Another account from the same IP is not locked out.
    expect((await login(app, 'grace@test.edu')).status).toBe(200);
  });

  it('does not count successful sign-ins towards the limit', async () => {
    await createAccounts();
    const app = buildApp({ windowMs: 60_000, limit: 2 });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await login(app, 'ada@test.edu')).status).toBe(200);
    }
  });

  it('records admin logins in the audit log (and not student logins)', async () => {
    const { adminId } = await createAccounts();
    const app = buildApp();
    await login(app, 'admin@test.edu');
    await login(app, 'ada@test.edu');

    const audit = await getTestPool().query<{ actor_user_id: string; action: string }>(
      'SELECT actor_user_id, action, entity_type, entity_id FROM audit_logs',
    );
    expect(audit.rows).toEqual([
      { actor_user_id: adminId, action: 'LOGIN', entity_type: 'user', entity_id: adminId },
    ]);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user with the session cookie', async () => {
    const { studentId } = await createAccounts();
    const app = buildApp();
    const cookie = sessionCookie(await login(app, 'ada@test.edu'));

    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(dataOf(response)).toEqual({
      id: studentId,
      email: 'ada@test.edu',
      role: 'STUDENT',
      student: {
        name: expect.any(String) as string,
        rollNumber: expect.any(String) as string,
        program: { code: expect.any(String) as string, name: expect.any(String) as string },
        semester: 5,
        creditsCompleted: 90,
      },
    });
  });

  it('returns admins without a student profile', async () => {
    const { adminId } = await createAccounts();
    const app = buildApp();
    const cookie = sessionCookie(await login(app, 'admin@test.edu'));

    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(dataOf(response)).toEqual({ id: adminId, email: 'admin@test.edu', role: 'ADMIN' });
  });

  it('returns 401 without a cookie', async () => {
    const response = await request(buildApp()).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, data: null });
  });

  it('returns 401 for tampered, expired, forged and stale tokens', async () => {
    const { studentId } = await createAccounts();
    const app = buildApp();
    const valid = tokenFor(studentId, 'STUDENT');
    const [header, payload, signature] = valid.split('.');
    const escalated = Buffer.from(
      JSON.stringify({ ...(jwt.decode(valid) as object), role: 'ADMIN' }),
    ).toString('base64url');

    const tokens = {
      tampered: `${header ?? ''}.${escalated}.${signature ?? ''}`,
      truncatedSignature: `${header ?? ''}.${payload ?? ''}.${(signature ?? '').slice(0, -2)}`,
      expired: tokenFor(studentId, 'STUDENT', { expiresIn: -10 }),
      wrongSecret: jwt.sign({ role: 'STUDENT' }, 'another-secret-another-secret-123', {
        subject: studentId,
      }),
      // Correctly signed, but the role no longer matches the database.
      staleRole: tokenFor(studentId, 'ADMIN'),
      deletedUser: tokenFor('00000000-0000-4000-8000-000000000000', 'STUDENT'),
    };

    for (const [name, token] of Object.entries(tokens)) {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
      expect(response.status, name).toBe(401);
    }
    const control = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${valid}`);
    expect(control.status).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const response = await request(buildApp())
      .post('/api/auth/logout')
      .set('Origin', ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    const setCookie = sessionSetCookie(response);
    expect(setCookie).toMatch(/^cr_session=;/);
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookie).toMatch(/Path=\/api/);
  });
});

describe('role-based access', () => {
  it('gives students 403 and admins 200 on /api/admin/ping', async () => {
    const { adminId } = await createAccounts();
    const app = buildApp();
    const studentCookie = sessionCookie(await login(app, 'ada@test.edu'));
    const adminCookie = sessionCookie(await login(app, 'admin@test.edu'));

    const asStudent = await request(app).get('/api/admin/ping').set('Cookie', studentCookie);
    const asAdmin = await request(app).get('/api/admin/ping').set('Cookie', adminCookie);
    const anonymous = await request(app).get('/api/admin/ping');

    expect(asStudent.status).toBe(403);
    expect(asStudent.body).toMatchObject({ success: false, data: null });
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body).toEqual({ success: true, data: { status: 'ok', adminId } });
    expect(anonymous.status).toBe(401);
  });

  it('/api/students/me returns only the caller’s own profile', async () => {
    const { studentId, otherStudentId } = await createAccounts();
    const app = buildApp();
    const adaCookie = sessionCookie(await login(app, 'ada@test.edu'));
    const graceCookie = sessionCookie(await login(app, 'grace@test.edu'));

    const ada = await request(app).get('/api/students/me').set('Cookie', adaCookie);
    const grace = await request(app).get('/api/students/me').set('Cookie', graceCookie);
    // Ids supplied by the client are ignored; there is no id-based route to abuse.
    const withQuery = await request(app)
      .get(`/api/students/me?studentId=${otherStudentId}`)
      .set('Cookie', adaCookie);
    const byId = await request(app).get(`/api/students/${otherStudentId}`).set('Cookie', adaCookie);

    expect(dataOf(ada)).toMatchObject({ userId: studentId, email: 'ada@test.edu' });
    expect(dataOf(grace)).toMatchObject({ userId: otherStudentId, email: 'grace@test.edu' });
    expect(dataOf(withQuery)).toMatchObject({ userId: studentId });
    expect(byId.status).toBe(404);
  });

  it('gives admins 403 on student endpoints', async () => {
    await createAccounts();
    const app = buildApp();
    const adminCookie = sessionCookie(await login(app, 'admin@test.edu'));

    expect((await request(app).get('/api/students/me').set('Cookie', adminCookie)).status).toBe(
      403,
    );
  });
});

describe('CSRF origin check', () => {
  it('rejects state-changing requests from a disallowed Origin', async () => {
    await createAccounts();
    const app = buildApp();

    const crossSite = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'ada@test.edu', password: TEST_PASSWORD });
    const noOrigin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@test.edu', password: TEST_PASSWORD });
    const crossSiteRead = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example');

    expect(crossSite.status).toBe(403);
    expect(crossSite.body).toEqual({
      success: false,
      data: null,
      message: 'Cross-origin request rejected.',
    });
    expect(sessionSetCookie(crossSite)).toBe('');
    expect(noOrigin.status).toBe(200);
    expect(crossSiteRead.status).toBe(200);
  });
});

describe('secrets never leak', () => {
  it('no auth response contains a password hash', async () => {
    const { studentId } = await createAccounts();
    const app = buildApp();
    const studentLogin = await login(app, 'ada@test.edu');
    const cookie = sessionCookie(studentLogin);
    const adminLogin = await login(app, 'admin@test.edu');

    const responses = [
      studentLogin,
      adminLogin,
      await login(app, 'ada@test.edu', 'wrong'),
      await login(app, 'nobody@test.edu', 'wrong'),
      await request(app).get('/api/auth/me').set('Cookie', cookie),
      await request(app).get('/api/students/me').set('Cookie', cookie),
      await request(app).post('/api/auth/logout').set('Cookie', cookie),
    ];

    for (const response of responses) {
      expect(response.text).not.toContain(TEST_PASSWORD_HASH);
      expect(response.text).not.toMatch(/password_?hash/i);
      expect(response.text).not.toMatch(/\$2[aby]\$/);
    }
    expect(studentId).toBeTruthy();
  });
});
