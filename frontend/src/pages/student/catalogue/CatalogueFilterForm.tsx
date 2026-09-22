import { COURSE_SORT_KEYS, type CatalogueFilterOptions } from '@course-reg/shared';
import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Button } from '../../../components/Button';
import { Checkbox } from '../../../components/Checkbox';
import { FormField } from '../../../components/FormField';
import { Input } from '../../../components/Input';
import { Select } from '../../../components/Select';
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
 * The catalogue's filters as a real search form. Selects and checkboxes apply
 * at once; the text search waits until typing pauses (debounce), and Enter
 * searches straight away.
 */
export function CatalogueFilterForm({
  filters,
  options,
  onChange,
  onClear,
}: CatalogueFilterFormProps) {
  const isPhone = useMediaQuery('(width < 40rem)');
  const [searchText, setSearchText] = useState(filters.search);
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

  const refinements = (
    <>
      <FormField label="Department">
        {(control) => (
          <Select
            {...control}
            name="department"
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
        )}
      </FormField>

      <FormField label="Credits">
        {(control) => (
          <Select
            {...control}
            name="credits"
            value={filters.credits === null ? '' : String(filters.credits)}
            placeholder="Any"
            options={options.credits.map((credits) => ({
              value: String(credits),
              label: `${credits} credits`,
            }))}
            onChange={(event) => {
              onChange({ credits: event.target.value ? Number(event.target.value) : null });
            }}
          />
        )}
      </FormField>

      <FormField label="Sort by">
        {(control) => (
          <Select
            {...control}
            name="sort"
            value={filters.sort}
            options={SORT_OPTIONS}
            onChange={(event) => {
              const sort = COURSE_SORT_KEYS.find((key) => key === event.target.value);
              if (sort) {
                onChange({ sort });
              }
            }}
          />
        )}
      </FormField>

      <fieldset className={styles.toggles}>
        <legend className="visually-hidden">Show only</legend>
        <Checkbox
          name="onlyEligible"
          label="Only courses I’m eligible for"
          checked={filters.onlyEligible}
          onChange={(event) => {
            onChange({ onlyEligible: event.target.checked });
          }}
        />
        <Checkbox
          name="onlyAvailable"
          label="Only courses with seats left"
          checked={filters.onlyAvailable}
          onChange={(event) => {
            onChange({ onlyAvailable: event.target.checked });
          }}
        />
      </fieldset>

      <div className={styles.actions}>
        <Button variant="ghost" size="sm" iconStart={RotateCcw} onClick={handleClear}>
          Clear filters
        </Button>
      </div>
    </>
  );

  return (
    <form role="search" aria-label="Filter courses" className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.search}>
        <FormField label="Search" hint="Course code or name, e.g. CS401 or security">
          {(control) => (
            <Input
              {...control}
              type="search"
              name="search"
              value={searchText}
              autoComplete="off"
              spellCheck={false}
              maxLength={100}
              onChange={handleSearchChange}
            />
          )}
        </FormField>
      </div>

      {isPhone ? (
        // Phones: the selects and toggles fold away so results start on screen one.
        <details className={styles.more}>
          <summary className={styles.summary}>
            Filters and sort
            {refinementCount > 0 && ` · ${refinementCount} set`}
          </summary>
          <div className={styles.moreBody}>{refinements}</div>
        </details>
      ) : (
        refinements
      )}
    </form>
  );
}
