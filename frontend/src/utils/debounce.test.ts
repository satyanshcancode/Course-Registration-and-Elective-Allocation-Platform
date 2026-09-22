import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the delay before calling', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 250);

    debounced('a');
    vi.advanceTimersByTime(249);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('restarts the delay on every call and passes the latest arguments', () => {
    const fn = vi.fn<(query: string, page: number) => void>();
    const debounced = debounce(fn, 200);

    debounced('a', 1);
    vi.advanceTimersByTime(150);
    debounced('ai', 2);
    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('ai', 2);
  });

  it('cancel() drops the pending call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(debounced.pending()).toBe(true);
    debounced.cancel();
    vi.advanceTimersByTime(500);

    expect(fn).not.toHaveBeenCalled();
    expect(debounced.pending()).toBe(false);
  });

  it('flush() runs the pending call immediately, once', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('now');
    debounced.flush();
    vi.advanceTimersByTime(500);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('now');
  });

  it('keeps separate state for separate debounced functions', () => {
    const first = vi.fn();
    const second = vi.fn();
    const debouncedFirst = debounce(first, 100);
    const debouncedSecond = debounce(second, 100);

    debouncedFirst(1);
    debouncedSecond(2);
    debouncedFirst.cancel();
    vi.advanceTimersByTime(100);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(2);
  });
});
