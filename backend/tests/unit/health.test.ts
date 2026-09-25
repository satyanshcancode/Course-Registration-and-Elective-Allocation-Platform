import type { ApiResponse, HealthStatus } from '@course-reg/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { HealthRepository } from '../../src/repositories/healthRepository.js';
import { createHealthService } from '../../src/services/healthService.js';

const FIXED_NOW = new Date('2026-01-15T09:30:00.000Z');

const notUsed = () => Promise.reject(new Error('not used in this test'));

function buildApp(repository: HealthRepository) {
  return createApp({
    corsOrigins: ['http://localhost:5173'],
    jsonBodyLimit: '100kb',
    cookieSecure: false,
    services: {
      healthService: createHealthService(repository, {
        now: () => FIXED_NOW,
        uptimeSeconds: () => 42.9,
      }),
      authService: {
        login: notUsed,
        resolveSession: () => Promise.resolve(null),
        getCurrentUser: notUsed,
      },
      allocationService: {
        preview: notUsed,
        run: notUsed,
        listRuns: notUsed,
        getRun: notUsed,
        verify: notUsed,
        getStudentResults: notUsed,
      },
      studentService: { getOwnProfile: notUsed, countUnreadNotifications: notUsed },
      catalogueService: {
        getCurrentWindow: notUsed,
        listCatalogue: notUsed,
        getCourse: notUsed,
        getSeats: notUsed,
      },
      cartService: { getCart: notUsed, saveCart: notUsed },
      submitService: { submit: notUsed, getStatus: notUsed },
      eligibilityService: { getOverview: notUsed, getCourse: notUsed },
      adminCourseService: { listOfferings: notUsed, updateCapacity: notUsed },
      registrationWindowService: {
        getDetail: notUsed,
        updateWindow: notUsed,
        open: notUsed,
        close: notUsed,
      },
    },
  });
}

const reachableDatabase: HealthRepository = { pingDatabase: () => Promise.resolve() };
const unreachableDatabase: HealthRepository = {
  pingDatabase: () => Promise.reject(new Error('connect ECONNREFUSED')),
};

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    const response = await request(buildApp(reachableDatabase)).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    const body = response.body as ApiResponse<HealthStatus>;
    expect(body).toEqual({
      success: true,
      data: {
        status: 'ok',
        database: { status: 'ok', latencyMs: expect.any(Number) as number },
        uptimeSeconds: 42,
        timestamp: FIXED_NOW.toISOString(),
      },
    });
  });

  it('reports degraded with 503 when the database is down', async () => {
    const response = await request(buildApp(unreachableDatabase)).get('/api/health');

    expect(response.status).toBe(503);
    const body = response.body as ApiResponse<HealthStatus>;
    expect(body.success).toBe(true);
    if (body.success) {
      expect(body.data.status).toBe('degraded');
      expect(body.data.database).toEqual({ status: 'down', latencyMs: null });
    }
  });

  it('sets security headers via helmet', async () => {
    const response = await request(buildApp(reachableDatabase)).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('error handling', () => {
  it('returns an ApiFailure for unknown routes', async () => {
    const response = await request(buildApp(reachableDatabase)).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      data: null,
      message: 'Route GET /api/does-not-exist not found',
    });
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const response = await request(buildApp(reachableDatabase))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, data: null });
  });

  it('returns 413 for bodies over the size limit', async () => {
    const response = await request(buildApp(reachableDatabase))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(200_000) }));

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ success: false, data: null });
  });
});
