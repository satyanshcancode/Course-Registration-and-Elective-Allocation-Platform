import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HISTORY_FILTERS,
  historyFiltersKey,
  readHistoryFilters,
  writeHistoryFilters,
} from './historyFilters';

const read = (search: string) => readHistoryFilters(new URLSearchParams(search));
const write = (search: string, filters: Parameters<typeof writeHistoryFilters>[1]) =>
  writeHistoryFilters(new URLSearchParams(search), filters).toString();

describe('readHistoryFilters', () => {
  it('reads both filters out of the URL', () => {
    expect(read('type=PROMOTED&course=cs401')).toEqual({ type: 'PROMOTED', course: 'CS401' });
  });

  it('falls back to the default for anything it does not recognise', () => {
    expect(read('type=NONSENSE')).toEqual(DEFAULT_HISTORY_FILTERS);
    expect(read('')).toEqual(DEFAULT_HISTORY_FILTERS);
  });
});

describe('writeHistoryFilters', () => {
  it('leaves the defaults out of the URL rather than writing them empty', () => {
    expect(write('type=PROMOTED', DEFAULT_HISTORY_FILTERS)).toBe('');
  });

  it('keeps parameters it knows nothing about', () => {
    expect(write('view=table', { type: 'DROPPED', course: '' })).toBe('view=table&type=DROPPED');
  });
});

describe('historyFiltersKey', () => {
  it('changes when either filter changes, so the request restarts', () => {
    const keys = [
      historyFiltersKey({ type: null, course: '' }),
      historyFiltersKey({ type: 'DROPPED', course: '' }),
      historyFiltersKey({ type: null, course: 'CS401' }),
      historyFiltersKey({ type: 'DROPPED', course: 'CS401' }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
