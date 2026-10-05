/**
 * The dashboard's greeting. Pure, so the wording is tested rather than
 * observed at nine in the morning.
 */

/**
 * "Good morning" / "Good afternoon" / "Good evening".
 *
 * `now` is the SERVER's instant (see useServerClock), read in the reader's own
 * time zone: which part of the day it is should follow the person looking at
 * the screen, while the instant itself must not come from a device clock that
 * may be wrong.
 */
export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

/**
 * The name to greet someone by: the first word of their name, falling back to
 * the whole trimmed string when there is no first word to take.
 */
export function firstNameOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] ?? trimmed;
}
