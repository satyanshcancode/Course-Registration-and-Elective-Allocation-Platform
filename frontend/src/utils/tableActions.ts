/**
 * Event delegation for table row actions: ONE click listener on the table
 * body handles every row's buttons, instead of a listener per button.
 */

/** The action a row button asks for, read from its data-* attributes. */
export interface RowAction {
  action: string;
  courseCode: string;
}

/**
 * Finds the action button a click came from.
 *
 * `target` is the element actually clicked: often not the button itself but
 * something inside it (the icon's <svg>, a <path>, a <span> of text). The click
 * event bubbles up from there through every ancestor, which is why a single
 * listener on the <tbody> (`container`, the event's currentTarget) hears clicks
 * on all rows. `closest()` walks from the target back up to the nearest
 * element with a data-action; `contains()` makes sure that button belongs to
 * this table and not to something outside it.
 */
export function findRowAction(target: EventTarget | null, container: Element): RowAction | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const button = target.closest<HTMLElement>('[data-action][data-course-code]');
  if (!button || !container.contains(button) || button.matches(':disabled')) {
    return null;
  }
  const { action, courseCode } = button.dataset;
  return action && courseCode ? { action, courseCode } : null;
}
