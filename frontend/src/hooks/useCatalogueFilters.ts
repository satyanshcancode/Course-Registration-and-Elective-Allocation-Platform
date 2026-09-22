import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  clearFilters,
  readFilters,
  updateFilters,
  writeFilters,
  type CatalogueFilters,
} from '../utils/catalogueFilters';

export interface CatalogueFiltersControl {
  filters: CatalogueFilters;
  setFilters: (change: Partial<CatalogueFilters>) => void;
  clear: () => void;
}

/**
 * Catalogue filters stored in the URL query string, so the view can be shared
 * and survives a refresh. Changes replace the history entry: Back leaves the
 * catalogue instead of stepping through every keystroke.
 */
export function useCatalogueFilters(): CatalogueFiltersControl {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);

  const setFilters = useCallback(
    (change: Partial<CatalogueFilters>) => {
      setParams((current) => writeFilters(updateFilters(readFilters(current), change)), {
        replace: true,
      });
    },
    [setParams],
  );

  const clear = useCallback(() => {
    setParams((current) => writeFilters(clearFilters(readFilters(current))), { replace: true });
  }, [setParams]);

  return { filters, setFilters, clear };
}
