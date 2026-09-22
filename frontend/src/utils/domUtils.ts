import type { RefObject } from 'react';

type ElementRef<T extends HTMLElement> = RefObject<T | null>;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Focuses the ref'd element if it is still in the document. Returns success. */
export function focusElement<T extends HTMLElement>(
  ref: ElementRef<T>,
  options: FocusOptions = { preventScroll: true },
): boolean {
  const element = ref.current;
  if (!element?.isConnected) {
    return false;
  }
  element.focus(options);
  return document.activeElement === element;
}

/** Focuses the first keyboard-focusable element inside the container. */
export function focusFirstFocusable<T extends HTMLElement>(container: ElementRef<T>): boolean {
  const first = container.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  if (!first) {
    return false;
  }
  first.focus();
  return true;
}

/** Scrolls the element into view unless it is already fully visible. */
export function scrollIntoViewIfNeeded<T extends HTMLElement>(
  ref: ElementRef<T>,
  behavior: ScrollBehavior = 'auto',
): void {
  const element = ref.current;
  if (!element?.isConnected) {
    return;
  }
  const rect = element.getBoundingClientRect();
  const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (!visible && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'nearest', behavior });
  }
}

/** The element focus should return to later (e.g. when a dialog closes). */
export function currentlyFocused(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
