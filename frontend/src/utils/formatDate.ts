/**
 * Date formatting for the UI, built on Intl. Every function takes an explicit
 * `timeZone` option so output is deterministic in tests; in the browser it
 * defaults to the user's zone.
 */

export interface FormatOptions {
  timeZone?: string;
  locale?: string;
}

const DEFAULT_LOCALE = 'en-GB';

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function parts(date: Date, format: Intl.DateTimeFormatOptions, options: FormatOptions) {
  const formatter = new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    ...format,
    timeZone: options.timeZone,
  });
  const byType = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return (type: Intl.DateTimeFormatPartTypes) => byType.get(type) ?? '';
}

/** Newer ICU writes "Sept"; the registrar style is three letters. */
const shortMonth = (month: string) => month.slice(0, 3);

/** "Mon 21 Sep" */
export function formatDate(value: Date | string | number, options: FormatOptions = {}): string {
  const get = parts(toDate(value), { weekday: 'short', day: 'numeric', month: 'short' }, options);
  return `${get('weekday')} ${get('day')} ${shortMonth(get('month'))}`;
}

/** "10:00" (24-hour clock, as on a timetable) */
export function formatTime(value: Date | string | number, options: FormatOptions = {}): string {
  const get = parts(
    toDate(value),
    { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    options,
  );
  return `${get('hour')}:${get('minute')}`;
}

/** "Mon 21 Sep, 10:00" */
export function formatDateTime(value: Date | string | number, options: FormatOptions = {}): string {
  return `${formatDate(value, options)}, ${formatTime(value, options)}`;
}

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

/**
 * "in 2 hours", "3 days ago", "tomorrow", "now". Picks the largest unit that
 * fits, so a gap of 90 minutes reads "in 2 hours" rather than "in 90 minutes".
 */
export function formatRelative(
  value: Date | string | number,
  now: Date = new Date(),
  locale = 'en',
): string {
  const seconds = Math.round((toDate(value).getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(seconds) < 45) {
    return formatter.format(0, 'second');
  }
  const [unit, size] =
    RELATIVE_UNITS.find(([, unitSeconds]) => Math.abs(seconds) >= unitSeconds * 0.9) ??
    RELATIVE_UNITS[RELATIVE_UNITS.length - 1] ??
    (['second', 1] as const);
  return formatter.format(Math.round(seconds / size), unit);
}
