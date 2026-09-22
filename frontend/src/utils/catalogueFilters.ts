/**
 * Catalogue filters <-> URL query string. The URL is the single source of
 * truth for the view, so it can be shared, bookmarked and survives a refresh.
 */
import {
  COURSE_SORT_KEYS,
  isOneOf,
  type CatalogueQuery,
  type CourseSortKey,
} from '@course-reg/shared';

export const CATALOGUE_VIEWS = ['cards', 'table'] as const;
export type CatalogueView = (typeof CATALOGUE_VIEWS)[number];

export interface CatalogueFilters {
  search: string;
  /** Department code, '' for all. */
  department: string;
  credits: number | null;
  onlyEligible: boolean;
  onlyAvailable: boolean;
  sort: CourseSortKey;
  page: number;
  view: CatalogueView;
}

export const DEFAULT_FILTERS: Readonly<CatalogueFilters> = {
  search: '',
  department: '',
  credits: null,
  onlyEligible: false,
  onlyAvailable: false,
  sort: 'code',
  page: 1,
  view: 'cards',
};

/** Sort choices, in the order the select shows them. */
export const SORT_LABELS: Readonly<Record<CourseSortKey, string>> = {
  code: 'Course code',
  name: 'Course name',
  available: 'Most seats left',
  demand: 'Most requested',
  demandRatio: 'Highest demand ratio',
};

function positiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return parsed >= 1 ? parsed : null;
}

/** Reads filters from the URL. Anything unknown or malformed falls back to the default. */
export function readFilters(params: URLSearchParams): CatalogueFilters {
  const sort = params.get('sort');
  const view = params.get('view');
  return {
    search: params.get('search')?.trim() ?? DEFAULT_FILTERS.search,
    department: params.get('department')?.toUpperCase() ?? DEFAULT_FILTERS.department,
    credits: positiveInteger(params.get('credits')),
    onlyEligible: params.get('onlyEligible') === 'true',
    onlyAvailable: params.get('onlyAvailable') === 'true',
    sort: isOneOf(COURSE_SORT_KEYS, sort) ? sort : DEFAULT_FILTERS.sort,
    page: positiveInteger(params.get('page')) ?? DEFAULT_FILTERS.page,
    view: isOneOf(CATALOGUE_VIEWS, view) ? view : DEFAULT_FILTERS.view,
  };
}

/** Writes filters to URL parameters, leaving defaults out so URLs stay short. */
export function writeFilters(filters: CatalogueFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.department) params.set('department', filters.department);
  if (filters.credits !== null) params.set('credits', String(filters.credits));
  if (filters.onlyEligible) params.set('onlyEligible', 'true');
  if (filters.onlyAvailable) params.set('onlyAvailable', 'true');
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.page !== DEFAULT_FILTERS.page) params.set('page', String(filters.page));
  if (filters.view !== DEFAULT_FILTERS.view) params.set('view', filters.view);
  return params;
}

/**
 * Applies a change. Anything other than paging or switching the view starts
 * again at page 1, because the old page number may no longer exist.
 */
export function updateFilters(
  current: CatalogueFilters,
  change: Partial<CatalogueFilters>,
): CatalogueFilters {
  const keepsPage = Object.keys(change).every((key) => key === 'page' || key === 'view');
  return { ...current, ...(keepsPage ? {} : { page: 1 }), ...change };
}

/** Filters that narrow the list (the view, sort and page don't count). */
export function hasActiveFilters(filters: CatalogueFilters): boolean {
  return (
    filters.search !== '' ||
    filters.department !== '' ||
    filters.credits !== null ||
    filters.onlyEligible ||
    filters.onlyAvailable
  );
}

/** Keeps the view but resets every filter, the sort and the page. */
export function clearFilters(filters: CatalogueFilters): CatalogueFilters {
  return { ...DEFAULT_FILTERS, view: filters.view };
}

/** The API query for these filters. */
export function toCatalogueQuery(filters: CatalogueFilters, pageSize: number): CatalogueQuery {
  const query: CatalogueQuery = { sort: filters.sort, page: filters.page, pageSize };
  if (filters.search) query.search = filters.search;
  if (filters.department) query.department = filters.department;
  if (filters.credits !== null) query.credits = filters.credits;
  if (filters.onlyEligible) query.onlyEligible = true;
  if (filters.onlyAvailable) query.onlyAvailable = true;
  return query;
}
