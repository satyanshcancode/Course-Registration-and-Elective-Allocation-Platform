import { useState } from 'react';
import { usePolling } from './usePolling';

/** One tick per second is enough for "3h 12m 08s". */
export const CLOCK_TICK_MS = 1000;

/**
 * The server's current time, ticking once a second.
 *
 * `offsetMs` is the server's clock minus the device's, measured when the
 * window was loaded, so a wrong device clock can't mislead the countdown.
 * Ticking runs through usePolling, which stops entirely while the tab is
 * hidden and catches up the moment it is shown again.
 */
export function useServerClock(offsetMs: number, enabled = true): Date {
  const [deviceNow, setDeviceNow] = useState(() => Date.now());

  usePolling(
    () => {
      setDeviceNow(Date.now());
    },
    CLOCK_TICK_MS,
    { enabled },
  );

  return new Date(deviceNow + offsetMs);
}
