import { useEffect } from 'react';

/**
 * Warns before leaving the page while `when` is true (unsaved cart changes).
 *
 * The listener is only attached while there is something to lose: an
 * always-on `beforeunload` handler makes every navigation slower and is
 * ignored by browsers that require a user gesture first. The browser shows
 * its own wording; `preventDefault()` is what asks for the prompt.
 */
export function useBeforeUnload(when: boolean): void {
  useEffect(() => {
    if (!when) {
      return undefined;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [when]);
}
