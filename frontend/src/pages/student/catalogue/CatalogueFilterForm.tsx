import { COURSE_SORT_KEYS, type CatalogueFilterOptions } from '@course-reg/shared';
import { ListFilter, RotateCcw, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Icon } from '../../../components/Icon';
import { Select } from '../../../components/Select';
import { Toggle } from '../../../components/Toggle';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { SORT_LABELS, type CatalogueFilters } from '../../../utils/catalogueFilters';
import { debounce, type Debounced } from '../../../utils/debounce';
import styles from './CatalogueFilterForm.module.css';

/** Pause after the last keystroke before searching. */
export const SEARCH_DELAY_MS = 300;

export interface CatalogueFilterFormProps {
  filters: CatalogueFilters;
  options: CatalogueFilterOptions;
  onChange: (change: Partial<CatalogueFilters>) => void;
  onClear: () => void;
}

const SORT_OPTIONS = COURSE_SORT_KEYS.map((key) => ({ value: key, label: SORT_LABELS[key] }));

/**
 * The catalogue's filters as a real search form: a search box, three selects
 * and the Filters button across the top, the two switches below.
 *
 * Selects and switches apply at once; the text search waits until typing
 * pauses (debounce), and Enter searches straight away.
 *
 * Filters is a disclosure, open by default on anything wider than a phone. It
 * is how the switches fold away on a desktop, and on a phone it holds the
 * selects too, where there is no room for four controls in a row.
 */
export function CatalogueFilterForm({
  filters,
  options,
  onChange,
  onClear,
}: CatalogueFilterFormProps) {
  const isPhone = useMediaQuery('(width < 40rem)');
  const [searchText, setSearchText] = useState(filters.search);
  // Open on anything wider than a phone, where the switches simply belong on
  // screen. `isPhone ? ... : ...` rather than state seeded once, because the
  // window can be resized across the breakpoint.
  const [open, setOpen] = useState<boolean | null>(null);
  const showRefinements = open ?? !isPhone;
  const panelId = useId();
  const onChangeRef = useRef(onChange);
  const debouncedRef = useRef<Debounced<[string]> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // A search still waiting must not fire after the form is gone.
  useEffect(
    () => () => {
      debouncedRef.current?.cancel();
    },
    [],
  );

  // debounce() returns a function that closes over its own timer, so every
  // keystroke restarts the same countdown. Created on first use, in a handler.
  const searchSoon = (): Debounced<[string]> => {
    debouncedRef.current ??= debounce((text: string) => {
      onChangeRef.current({ search: text.trim() });
    }, SEARCH_DELAY_MS);
    return debouncedRef.current;
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
    searchSoon()(event.target.value);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const search = searchSoon();
    search(searchText);
    search.flush();
  };

  const handleClear = () => {
    debouncedRef.current?.cancel();
    setSearchText('');
    onClear();
  };

  const refinementCount = [
    filters.department !== '',
    filters.credits !== null,
    filters.onlyEligible,
    filters.onlyAvailable,
    filters.sort !== 'code',
  ].filter(Boolean).length;

  const selects = (
    <>
      <Select
        size="sm"
        name="department"
        aria-label="Department"
        value={filters.department}
        placeholder="All departments"
        options={options.departments.map((department) => ({
          value: department.code,
          label: department.name,
        }))}
        onChange={(event) => {
          onChange({ department: event.target.value });
        }}
      />
      <Select
        size="sm"
        name="credits"
        aria-label="Credits"
        value={filters.credits === null ? '' : String(filters.credits)}
        placeholder="Credits"
        options={options.credits.map((credits) => ({
          value: String(credits),
          label: `${credits} credits`,
        }))}
        onChange={(event) => {
          onChange({ credits: event.target.value ? Number(event.target.value) : null });
        }}
      />
      <Select
        size="sm"
        name="sort"
        aria-label="Sort by"
        value={filters.sort}
        options={SORT_OPTIONS}
        onChange={(event) => {
          const sort = COURSE_SORT_KEYS.find((key) => key === event.target.value);
          if (sort) {
            onChange({ sort });
          }
        }}
      />
    </>
  );

  return (
    <form role="search" aria-label="Filter courses" className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.bar}>
        <span className={styles.search}>
          <Icon icon={Search} className={styles.searchIcon} />
          <label className="visually-hidden" htmlFor="catalogue-search">
            Search by course code, name or keyword
          </label>
          <input
            id="catalogue-search"
            className={styles.searchInput}
            type="search"
            name="search"
            value={searchText}
            placeholder="Search by course code, name or keyword..."
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            onChange={handleSearchChange}
          />
        </span>
        {!isPhone && selects}
        <button
          type="button"
          className={styles.summary}
          aria-expanded={showRefinements}
          aria-controls={panelId}
          onClick={() => {
            setOpen(!showRefinements);
          }}
        >
          <Icon icon={ListFilter} />
          Filters
          {refinementCount > 0 && <span className={styles.count}>{refinementCount}</span>}
        </button>
      </div>

      <div className={styles.moreBody} id={panelId} hidden={!showRefinements}>
        {isPhone && <div className={styles.phoneSelects}>{selects}</div>}
        <Toggle
          name="onlyEligible"
          label="Only eligible courses"
          checked={filters.onlyEligible}
          onChange={(checked) => {
            onChange({ onlyEligible: checked });
          }}
        />
        <Toggle
          name="onlyAvailable"
          label="Only courses with seats left"
          checked={filters.onlyAvailable}
          onChange={(checked) => {
            onChange({ onlyAvailable: checked });
          }}
        />
        <button type="button" className={styles.clear} onClick={handleClear}>
          <Icon icon={RotateCcw} />
          Clear filters
        </button>
      </div>
    </form>
  );
}
