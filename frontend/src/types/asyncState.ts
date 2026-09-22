/** State of an asynchronous operation, narrowed on `status`. */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

export type AsyncStatus = AsyncState<unknown>['status'];
