/** State of an asynchronous request, narrowed on `status`. */
export type AsyncState<T> =
  { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; message: string };
