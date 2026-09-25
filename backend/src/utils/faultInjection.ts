/**
 * Test-only fault injection, so an integration test can prove that a failure
 * part-way through the submit transaction rolls back completely.
 *
 * `enabled` is read ONCE, at module load, from NODE_ENV. In development or
 * production it is false for the life of the process and `armFault` throws,
 * so no request, environment variable or configuration change can turn this
 * on. The armed point is module state rather than an environment variable:
 * the test and the app under test share one process.
 */
const enabled = process.env.NODE_ENV === 'test';

let armedPoint: string | null = null;

/** Arms a fault point, or clears it with null. Tests only. */
export function armFault(point: string | null): void {
  if (!enabled) {
    throw new Error('Fault injection is only available when NODE_ENV is "test".');
  }
  armedPoint = point;
}

/** Throws when tests have armed this point; a no-op everywhere else. */
export function injectFault(point: string): void {
  if (enabled && armedPoint === point) {
    throw new Error(`Injected fault at ${point}`);
  }
}

/** True only in tests; exported so a test can assert the guard itself. */
export function faultInjectionEnabled(): boolean {
  return enabled;
}
