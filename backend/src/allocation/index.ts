/**
 * The allocation engine's entry point: pick a strategy, run it, hash it.
 *
 * Adding a method means writing one class and adding one case below; the
 * `never` in the default branch stops the build until that is done.
 */
import { createHash } from 'node:crypto';
import type { AllocationMethod } from '@course-reg/shared';
import { FcfsStrategy } from './fcfsStrategy.js';
import { PreferencePriorityStrategy } from './preferencePriorityStrategy.js';
import type { AllocationInput, AllocationOutput, AllocationStrategy } from './types.js';

export * from './types.js';
export { countJustifiedEnvy } from './results.js';
export { scoreFor, scoringConfigFor, tieBreaksFor, FINAL_YEAR_SEMESTER } from './scoring.js';
export { FcfsStrategy } from './fcfsStrategy.js';
export { PreferencePriorityStrategy } from './preferencePriorityStrategy.js';

/** Exhaustiveness guard: a new method breaks the build here until it is handled. */
function unhandledMethod(method: never): never {
  throw new Error(`No allocation strategy for method ${JSON.stringify(method)}`);
}

export function strategyFor(method: AllocationMethod): AllocationStrategy {
  switch (method) {
    case 'FCFS':
      return new FcfsStrategy();
    case 'PREFERENCE_PRIORITY':
      return new PreferencePriorityStrategy();
    default:
      return unhandledMethod(method);
  }
}

/** Every strategy, for the side-by-side preview. */
export function allStrategies(): AllocationStrategy[] {
  return [new FcfsStrategy(), new PreferencePriorityStrategy()];
}

/**
 * Runs a strategy and times it. The engine itself has no clock — that is what
 * makes it a pure function — so the one measurement it cannot take is added
 * here, where a clock is allowed.
 */
export function runStrategy(
  strategy: AllocationStrategy,
  input: AllocationInput,
): AllocationOutput {
  const startedAt = performance.now();
  const output = strategy.allocate(input);
  return {
    ...output,
    metrics: { ...output.metrics, runtimeMs: Math.round(performance.now() - startedAt) },
  };
}

/**
 * A fingerprint of what a run decided, so a later re-run can be compared with
 * it. Only the decisions are hashed — not the timings, which differ every
 * time — and the rows are sorted so the hash does not depend on their order.
 */
export function hashOutput(output: AllocationOutput): string {
  const rows = output.results
    .map((row) =>
      [
        row.studentId,
        row.courseId,
        row.rank,
        row.outcome,
        row.finalRank,
        row.waitlistPosition ?? '',
        row.score?.total ?? '',
      ].join('|'),
    )
    .sort();
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}
