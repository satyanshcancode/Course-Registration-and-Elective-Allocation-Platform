import { useEffect, type RefObject } from 'react';
import { focusElement } from '../utils/domUtils';

/**
 * Moves focus to the element when it mounts (without scrolling). Pages use it
 * on their <h1> so screen-reader users hear where a navigation landed.
 */
export function useFocusOnMount<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled = true,
): void {
  useEffect(() => {
    if (enabled) {
      focusElement(ref);
    }
  }, [enabled, ref]);
}
