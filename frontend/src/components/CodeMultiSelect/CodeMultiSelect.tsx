import { Check, Plus, X } from 'lucide-react';
import { useId, useMemo, useState, type ChangeEvent } from 'react';
import { FormField } from '../FormField';
import { Icon } from '../Icon';
import { Input } from '../Input';
import styles from './CodeMultiSelect.module.css';

export interface CodeOption {
  code: string;
  name: string;
}

export interface CodeMultiSelectProps {
  label: string;
  hint?: string;
  error?: string;
  options: readonly CodeOption[];
  /** Selected codes, in the order the user added them. */
  value: readonly string[];
  onChange: (codes: string[]) => void;
  /** Codes that cannot be chosen, e.g. the course being edited. */
  excluded?: readonly string[];
  /** Words for the empty state, e.g. "course" / "courses". */
  itemName: { one: string; other: string };
  id?: string;
}

/** Longest lists are the course catalogue's; more than this needs a search. */
const VISIBLE_OPTIONS = 40;

/**
 * A searchable multi-select over codes: type to narrow, click to add, and the
 * chosen ones are listed above as removable chips.
 *
 * Built from a text input and plain buttons rather than a combobox widget: the
 * options are checkboxes in a listbox that is always visible when filtered, so
 * it needs no ARIA pattern to be keyboard-usable — Tab reaches every option and
 * Space toggles it, which is what a native checkbox already does.
 *
 * The count of matches is announced politely as the filter narrows, so a screen
 * reader user knows the list changed under them.
 */
export function CodeMultiSelect({
  label,
  hint,
  error,
  options,
  value,
  onChange,
  excluded = [],
  itemName,
  id,
}: CodeMultiSelectProps) {
  const [query, setQuery] = useState('');
  const listId = useId();
  const summaryId = useId();

  const selected = useMemo(() => new Set(value), [value]);
  const blocked = useMemo(() => new Set(excluded), [excluded]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const available = options.filter((option) => !blocked.has(option.code));
    if (needle === '') {
      return available;
    }
    return available.filter(
      (option) =>
        option.code.toLowerCase().includes(needle) || option.name.toLowerCase().includes(needle),
    );
  }, [options, blocked, query]);

  const shown = matches.slice(0, VISIBLE_OPTIONS);
  const hidden = matches.length - shown.length;

  const nameOf = useMemo(
    () => new Map(options.map((option) => [option.code, option.name])),
    [options],
  );

  const toggle = (code: string) => {
    onChange(selected.has(code) ? value.filter((item) => item !== code) : [...value, code]);
  };

  const handleQuery = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  return (
    <div className={styles.select}>
      <FormField label={label} hint={hint} error={error} id={id}>
        {(control) => (
          <Input
            {...control}
            type="search"
            autoComplete="off"
            placeholder={`Search ${itemName.other} by code or name`}
            value={query}
            onChange={handleQuery}
            aria-describedby={
              [control['aria-describedby'], summaryId].filter(Boolean).join(' ') || undefined
            }
            aria-controls={listId}
          />
        )}
      </FormField>

      {value.length > 0 && (
        <ul className={styles.chosen} aria-label={`${label}, chosen`}>
          {value.map((code) => (
            <li key={code} className={styles.chip}>
              <span className={styles.chipCode}>{code}</span>
              <span className={styles.chipName}>{nameOf.get(code) ?? 'no longer listed'}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => {
                  toggle(code);
                }}
              >
                <Icon icon={X} />
                <span className="visually-hidden">
                  Remove {code} from {label.toLowerCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className={styles.summary} id={summaryId} aria-live="polite">
        {value.length} chosen
        {matches.length === 0
          ? ` · no ${itemName.other} match “${query}”`
          : hidden > 0
            ? ` · showing ${shown.length} of ${matches.length} matches, keep typing to narrow`
            : ` · ${matches.length} ${matches.length === 1 ? itemName.one : itemName.other} to choose from`}
      </p>

      <ul className={styles.options} id={listId}>
        {shown.map((option) => {
          const on = selected.has(option.code);
          return (
            <li key={option.code}>
              <button
                type="button"
                className={styles.option}
                aria-pressed={on}
                onClick={() => {
                  toggle(option.code);
                }}
              >
                <Icon icon={on ? Check : Plus} className={styles.optionIcon} />
                <span className={styles.optionCode}>{option.code}</span>
                <span className={styles.optionName}>{option.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
