/** State of an asynchronous operation, narrowed on `status`. */
export type AsyncState<T> =
  | { status: 'idle' }
  /** `previous` is the last successful result while a newer run loads (if any). */
  | { status: 'loading'; previous?: T }
  | { status: 'success'; data: T }
  /** `error` is what the task threw, for callers that need more than the message. */
  | { status: 'error'; message: string; error?: unknown };

export type AsyncStatus = AsyncState<unknown>['status'];
