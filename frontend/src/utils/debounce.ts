/** A debounced function: call it freely, it runs once calls stop for `waitMs`. */
export type Debounced<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  /** Drops the pending call, if any. */
  cancel: () => void;
  /** Runs the pending call immediately, if any. */
  flush: () => void;
  /** True while a call is waiting to run. */
  pending: () => boolean;
};

/**
 * Delays `fn` until `waitMs` has passed without another call, then invokes it
 * with the most recent arguments. The timer and latest arguments live in this
 * closure, so every debounced function has its own independent state.
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): Debounced<TArgs> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latestArgs: TArgs | undefined;

  const invoke = () => {
    const args = latestArgs;
    timer = undefined;
    latestArgs = undefined;
    if (args) {
      fn(...args);
    }
  };

  const debounced = (...args: TArgs) => {
    latestArgs = args;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(invoke, waitMs);
  };

  return Object.assign(debounced, {
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = undefined;
      latestArgs = undefined;
    },
    flush: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        invoke();
      }
    },
    pending: () => timer !== undefined,
  });
}
