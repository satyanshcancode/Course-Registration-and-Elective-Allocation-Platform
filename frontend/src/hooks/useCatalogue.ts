import {
  CATALOGUE_PAGE_SIZE,
  type CataloguePage,
  type RegistrationWindowSummary,
} from '@course-reg/shared';
import { useMemo } from 'react';
import { catalogueSearchParams, getCatalogue, getCurrentWindow } from '../api/courseApi';
import { unwrap } from '../api/unwrap';
import { toCatalogueQuery, type CatalogueFilters } from '../utils/catalogueFilters';
import { useAsync, type AsyncResource } from './useAsync';

export interface CatalogueData {
  window: RegistrationWindowSummary | null;
  /** Server clock minus device clock, measured when the data arrived. */
  clockOffsetMs: number;
  page: CataloguePage;
}

export const CATALOGUE_PAGE = CATALOGUE_PAGE_SIZE.default;

/** Loads the current window and one catalogue page for `filters`; reloads when they change. */
export function useCatalogue(filters: CatalogueFilters): AsyncResource<CatalogueData> {
  const query = useMemo(() => toCatalogueQuery(filters, CATALOGUE_PAGE), [filters]);
  const key = catalogueSearchParams(query).toString();

  return useAsync(
    async (signal) => {
      // Two independent requests, started together rather than one after the other.
      const [windowResponse, pageResponse] = await Promise.all([
        getCurrentWindow(signal),
        getCatalogue(query, signal),
      ]);
      const current = unwrap(windowResponse);
      return {
        window: current.window,
        clockOffsetMs: Date.parse(current.serverTime) - Date.now(),
        page: unwrap(pageResponse),
      };
    },
    { key },
  );
}
