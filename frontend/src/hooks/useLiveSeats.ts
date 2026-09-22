import type { SeatSnapshot } from '@course-reg/shared';
import { useEffect, useRef, useState } from 'react';
import { getSeats } from '../api/courseApi';
import { changedCodes, indexSeats, type SeatsByCode } from '../utils/liveSeats';
import { usePolling } from './usePolling';

/** How often seat numbers refresh while the tab is visible. */
export const SEAT_POLL_INTERVAL_MS = 10_000;
/** How long a changed number stays highlighted. */
export const SEAT_HIGHLIGHT_MS = 2_000;

export interface LiveSeats {
  /** The latest numbers from the server; null until the first poll lands. */
  snapshot: SeatSnapshot | null;
  seats: SeatsByCode | null;
  /** Codes whose numbers changed in the latest poll (briefly highlighted). */
  changed: ReadonlySet<string>;
  /** When the numbers were last confirmed current (a 200 or a 304). */
  updatedAt: Date | null;
  /** The last poll failed; polling carries on and recovers by itself. */
  failing: boolean;
}

interface SeatState {
  snapshot: SeatSnapshot | null;
  seats: SeatsByCode | null;
  changed: ReadonlySet<string>;
}

const NOTHING_CHANGED: ReadonlySet<string> = new Set();

/**
 * Polls GET /api/courses/seats every 10 s while the tab is visible, sending
 * the last ETag so an unchanged catalogue costs a bodiless 304. The page
 * merges `seats` into the courses it already loaded (withLiveSeats) instead
 * of refetching everything.
 */
export function useLiveSeats({
  enabled = true,
  intervalMs = SEAT_POLL_INTERVAL_MS,
}: { enabled?: boolean; intervalMs?: number } = {}): LiveSeats {
  const [state, setState] = useState<SeatState>({
    snapshot: null,
    seats: null,
    changed: NOTHING_CHANGED,
  });
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [failing, setFailing] = useState(false);
  const etagRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  const poll = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    let result: Awaited<ReturnType<typeof getSeats>>;
    try {
      result = await getSeats(etagRef.current, controller.signal);
    } catch {
      return; // aborted: the page is going away
    }
    if (result.kind === 'failed') {
      setFailing(true);
      return;
    }
    setFailing(false);
    setUpdatedAt(new Date());
    if (result.kind === 'not-modified') {
      return;
    }

    etagRef.current = result.etag;
    const next = indexSeats(result.data);
    setState((previous) => ({
      snapshot: result.data,
      seats: next,
      // The first snapshot is the baseline; only later changes are highlighted.
      changed: previous.seats ? changedCodes(previous.seats, next) : NOTHING_CHANGED,
    }));
    clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setState((current) => ({ ...current, changed: NOTHING_CHANGED }));
    }, SEAT_HIGHLIGHT_MS);
  };

  usePolling(poll, intervalMs, { enabled, immediate: true });

  return { ...state, updatedAt, failing };
}
