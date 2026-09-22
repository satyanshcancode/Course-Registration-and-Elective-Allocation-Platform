import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from './usePolling';

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(value: DocumentVisibilityState) {
  visibility = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Lets the promise chain inside a tick settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls at the given interval while visible', async () => {
    const callback = vi.fn();
    renderHook(() => {
      usePolling(callback, 5_000);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('pauses while the tab is hidden and polls immediately when it returns', async () => {
    const callback = vi.fn();
    renderHook(() => {
      usePolling(callback, 5_000);
    });

    act(() => {
      setVisibility('hidden');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      setVisibility('visible');
    });
    await flush();
    expect(callback).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('does not start a hidden page polling on mount, and stops on unmount', async () => {
    visibility = 'hidden';
    const callback = vi.fn();
    const { unmount } = renderHook(() => {
      usePolling(callback, 1_000, { immediate: true });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(callback).not.toHaveBeenCalled();

    unmount();
    act(() => {
      setVisibility('visible');
    });
    await flush();
    expect(callback).not.toHaveBeenCalled();
  });

  it('never overlaps a slow async callback', async () => {
    let finish: () => void = () => undefined;
    const callback = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderHook(() => {
      usePolling(callback, 1_000);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(callback).toHaveBeenCalledTimes(1);

    finish();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
