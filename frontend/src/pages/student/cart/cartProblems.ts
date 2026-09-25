/** Placing a refusal's problems beside the item they are about. */
import type { CartProblem } from '@course-reg/shared';

export type ProblemsByCode = ReadonlyMap<string, CartProblem[]>;

/** Problems that name a course, grouped by that course's code. */
export function problemsByCode(problems: readonly CartProblem[]): ProblemsByCode {
  const byCode = new Map<string, CartProblem[]>();
  for (const problem of problems) {
    if ('code' in problem) {
      byCode.set(problem.code, [...(byCode.get(problem.code) ?? []), problem]);
    }
  }
  return byCode;
}

/** The problems that belong to the cart as a whole, not to one course. */
export function generalProblems(problems: readonly CartProblem[]): CartProblem[] {
  return problems.filter((problem) => !('code' in problem));
}

/** True when the server says the cart changed underneath us: reload it. */
export function needsReload(problems: readonly CartProblem[]): boolean {
  return problems.some(
    (problem) => problem.type === 'CART_CHANGED' || problem.type === 'ALREADY_SUBMITTED',
  );
}
