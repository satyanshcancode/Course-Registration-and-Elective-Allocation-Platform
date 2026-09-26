import { useEffect, useState } from 'react';

/**
 * A value that follows `value` only once it has stopped changing for `delayMs`.
 *
 * Used where a keystroke would otherwise become a server request: the input
 * stays fully controlled and responsive, while the query it drives settles.
 * Built on `useState` + `useEffect` rather than the `debounce` utility because
 * the thing being delayed here is a value, not a call, and the cleanup then
 * cancels the pending timer on unmount for free.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return settled;
}
