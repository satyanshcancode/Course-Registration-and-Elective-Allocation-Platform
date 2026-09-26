import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  readHistoryFilters,
  writeHistoryFilters,
  type HistoryFilters,
} from '../utils/historyFilters';

export interface HistoryFiltersControl {
  filters: HistoryFilters;
  setFilters: (change: Partial<HistoryFilters>) => void;
}

/**
 * History filters stored in the URL, so a filtered timeline can be shared and
 * survives a refresh. Changes replace the history entry: Back leaves the page
 * rather than stepping through every filter the student tried.
 */
export function useHistoryFilters(): HistoryFiltersControl {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readHistoryFilters(params), [params]);

  const setFilters = useCallback(
    (change: Partial<HistoryFilters>) => {
      setParams(
        (current) => writeHistoryFilters(current, { ...readHistoryFilters(current), ...change }),
        { replace: true },
      );
    },
    [setParams],
  );

  return { filters, setFilters };
}
