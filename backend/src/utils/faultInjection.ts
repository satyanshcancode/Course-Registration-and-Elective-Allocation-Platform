/**
 * Test-only fault injection, so an integration test can prove that a failure
 * part-way through the submit transaction rolls back completely.
 *
 * The switch is read ONCE, at module load, from NODE_ENV. In development or
 * production `enabled` is false for the life of the process, so no request,
 * environment variable or configuration change can turn this on.
 */
const enabled = process.env.NODE_ENV === 'test';

export const FAULT_POINT_ENV = 'FAULT_INJECTION_POINT';

/** Throws when tests have armed this point; a no-op everywhere else. */
export function injectFault(point: string): void {
  if (!enabled) {
    return;
  }
  if (process.env[FAULT_POINT_ENV] === point) {
    throw new Error(`Injected fault at ${point}`);
  }
}

/** True only in tests; exported so a test can assert the guard itself. */
export function faultInjectionEnabled(): boolean {
  return enabled;
}
