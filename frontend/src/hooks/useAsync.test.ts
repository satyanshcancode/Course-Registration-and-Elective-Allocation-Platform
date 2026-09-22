import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsync, type AsyncTask } from './useAsync';

/** A task whose promise the test resolves or rejects by hand. */
function controllableTask<T>() {
  const calls: { signal: AbortSignal; resolve: (value: T) => void; reject: (e: Error) => void }[] =
    [];
  const task: AsyncTask<T> = (signal) =>
    new Promise<T>((resolve, reject) => {
      calls.push({ signal, resolve, reject });
    });
  return { task: vi.fn(task), calls };
}

describe('useAsync', () => {
  it('goes from loading to success', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve(42)));

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'success', data: 42 });
    });
  });

  it('reports errors and recovers on retry', async () => {
    const task = vi
      .fn<AsyncTask<string>>()
      .mockRejectedValueOnce(new Error('Could not load courses.'))
      .mockResolvedValueOnce('loaded');
    const { result } = renderHook(() => useAsync(task));

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        status: 'error',
        message: 'Could not load courses.',
      });
    });

    act(() => {
      result.current.retry();
    });
    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'success', data: 'loaded' });
    });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('stays idle until run() when immediate is false', async () => {
    const task = vi.fn(() => Promise.resolve('x'));
    const { result } = renderHook(() => useAsync(task, { immediate: false }));

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(task).not.toHaveBeenCalled();

    act(() => {
      result.current.run();
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'success', data: 'x' });
    });
  });

  it('aborts the previous request when the key changes and ignores its result', async () => {
    const { task, calls } = controllableTask<string>();
    const { result, rerender } = renderHook(({ key }) => useAsync(task, { key }), {
      initialProps: { key: 'ai' },
    });

    rerender({ key: 'cloud' });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.signal.aborted).toBe(true);

    act(() => {
      calls[0]?.resolve('stale result for "ai"');
      calls[1]?.resolve('fresh result for "cloud"');
    });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'success', data: 'fresh result for "cloud"' });
    });
  });

  it('aborts on unmount and never updates state afterwards', async () => {
    const { task, calls } = controllableTask<string>();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useAsync(task));

    unmount();
    expect(calls[0]?.signal.aborted).toBe(true);
    calls[0]?.resolve('too late');
    await Promise.resolve();

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('reset() returns to idle', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve(1)));
    await waitFor(() => {
      expect(result.current.state.status).toBe('success');
    });

    act(() => {
      result.current.reset();
    });
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('keeps the previous result available while a new key loads', async () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useAsync(() => Promise.resolve(`page ${key}`), { key }),
      { initialProps: { key: '1' } },
    );
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'success', data: 'page 1' });
    });

    rerender({ key: '2' });
    expect(result.current.state).toEqual({ status: 'loading', previous: 'page 1' });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'success', data: 'page 2' });
    });
  });
});
