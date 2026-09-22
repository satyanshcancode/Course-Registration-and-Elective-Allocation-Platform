import axe, { type RuleObject } from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe-core against rendered markup and fails with a readable list of
 * violations. Colour contrast can't be measured in jsdom (no rendering), so
 * it is off here; the palette's ratios are computed in docs/DESIGN.md.
 */
export async function expectNoA11yViolations(
  container: Element,
  { isolated = true }: { isolated?: boolean } = {},
): Promise<void> {
  const rules: RuleObject = { 'color-contrast': { enabled: false } };
  if (isolated) {
    // A single component isn't expected to sit inside page landmarks.
    rules.region = { enabled: false };
  }
  const results = await axe.run(container, { rules });
  const violations = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'n/a'}): ${violation.help} — ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  );
  expect(violations).toEqual([]);
}
