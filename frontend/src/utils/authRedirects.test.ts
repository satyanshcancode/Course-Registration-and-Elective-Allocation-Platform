import { describe, expect, it } from 'vitest';
import { homePathFor, postLoginPath, readLoginLocationState } from './authRedirects';

describe('postLoginPath', () => {
  it('sends each role to its own dashboard by default', () => {
    expect(homePathFor('STUDENT')).toBe('/student/dashboard');
    expect(postLoginPath('STUDENT', undefined)).toBe('/student/dashboard');
    expect(postLoginPath('ADMIN', undefined)).toBe('/admin/dashboard');
  });

  it('returns to the requested page inside the role’s area', () => {
    expect(postLoginPath('STUDENT', '/student/courses?term=2026-FALL')).toBe(
      '/student/courses?term=2026-FALL',
    );
    expect(postLoginPath('ADMIN', '/admin/allocation-runs')).toBe('/admin/allocation-runs');
  });

  it('ignores pages outside the role’s area and external or malformed targets', () => {
    expect(postLoginPath('STUDENT', '/admin/dashboard')).toBe('/student/dashboard');
    expect(postLoginPath('STUDENT', '/studentevil')).toBe('/student/dashboard');
    expect(postLoginPath('ADMIN', '//evil.example/admin/x')).toBe('/admin/dashboard');
    expect(postLoginPath('ADMIN', 'https://evil.example/admin/x')).toBe('/admin/dashboard');
  });
});

describe('readLoginLocationState', () => {
  it('keeps valid fields and drops anything else', () => {
    expect(readLoginLocationState({ from: '/student', notice: 'session-expired' })).toEqual({
      from: '/student',
      notice: 'session-expired',
    });
    expect(readLoginLocationState({ from: 42, notice: 'hacked' })).toEqual({});
    expect(readLoginLocationState(null)).toEqual({});
  });
});
