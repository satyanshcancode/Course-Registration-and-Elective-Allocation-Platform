import { describe, expect, it } from 'vitest';
import {
  clearFilters,
  DEFAULT_FILTERS,
  hasActiveFilters,
  readFilters,
  toCatalogueQuery,
  updateFilters,
  writeFilters,
  type CatalogueFilters,
} from './catalogueFilters';

describe('catalogue filters in the URL', () => {
  it('round-trips every filter through the query string', () => {
    const filters: CatalogueFilters = {
      search: 'security',
      department: 'CSE',
      credits: 4,
      onlyEligible: true,
      onlyAvailable: true,
      sort: 'demandRatio',
      page: 2,
      view: 'table',
    };
    const params = writeFilters(filters);
    expect(params.toString()).toBe(
      'search=security&department=CSE&credits=4&onlyEligible=true&onlyAvailable=true&sort=demandRatio&page=2&view=table',
    );
    expect(readFilters(params)).toEqual(filters);
  });

  it('leaves defaults out, so the plain catalogue has a clean URL', () => {
    expect(writeFilters(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('falls back to defaults for anything malformed or unknown', () => {
    const filters = readFilters(
      new URLSearchParams('sort=popularity&page=-2&credits=four&view=grid&onlyEligible=yes'),
    );
    expect(filters).toEqual(DEFAULT_FILTERS);
  });

  it('goes back to page 1 when a filter changes, but not when paging or switching view', () => {
    const onPage3 = { ...DEFAULT_FILTERS, page: 3 };
    expect(updateFilters(onPage3, { department: 'ME' }).page).toBe(1);
    expect(updateFilters(onPage3, { view: 'table' }).page).toBe(3);
    expect(updateFilters(onPage3, { page: 4 }).page).toBe(4);
  });

  it('clears filters, sort and page but keeps the chosen view', () => {
    const busy: CatalogueFilters = {
      ...DEFAULT_FILTERS,
      search: 'ai',
      sort: 'demand',
      view: 'table',
    };
    expect(hasActiveFilters(busy)).toBe(true);
    expect(clearFilters(busy)).toEqual({ ...DEFAULT_FILTERS, view: 'table' });
    expect(hasActiveFilters(clearFilters(busy))).toBe(false);
  });

  it('builds the API query without unset values', () => {
    expect(toCatalogueQuery({ ...DEFAULT_FILTERS, credits: 3 }, 12)).toEqual({
      sort: 'code',
      page: 1,
      pageSize: 12,
      credits: 3,
    });
  });
});
