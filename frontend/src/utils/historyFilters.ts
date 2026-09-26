/**
 * History filters <-> URL query string, exactly as the catalogue does it: the
 * URL is the single source of truth for the view, so it can be shared and
 * survives a refresh. Defaults are left out of the URL.
 */
import { HISTORY_EVENT_TYPES, isOneOf, type HistoryEventType } from '@course-reg/shared';

export interface HistoryFilters {
  /** Null means "every kind of event". */
  type: HistoryEventType | null;
  /** Course code, '' for all. */
  course: string;
}

export const DEFAULT_HISTORY_FILTERS: Readonly<HistoryFilters> = { type: null, course: '' };

/** Anything unknown or malformed falls back to the default. */
export function readHistoryFilters(params: URLSearchParams): HistoryFilters {
  const type = params.get('type');
  return {
    type: isOneOf(HISTORY_EVENT_TYPES, type) ? type : null,
    course: params.get('course')?.trim().toUpperCase() ?? DEFAULT_HISTORY_FILTERS.course,
  };
}

/** Writes the non-default filters, leaving every other parameter alone. */
export function writeHistoryFilters(
  params: URLSearchParams,
  filters: HistoryFilters,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of [
    ['type', filters.type ?? ''],
    ['course', filters.course],
  ] as const) {
    if (value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }
  return next;
}

/** A stable key for the filters, so changing one restarts the request. */
export function historyFiltersKey(filters: HistoryFilters): string {
  return `${filters.type ?? ''}|${filters.course}`;
}
