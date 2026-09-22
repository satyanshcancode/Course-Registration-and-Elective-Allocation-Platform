import { Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { debounce, type Debounced } from '../../utils/debounce';
import { Icon } from '../Icon';
import styles from './SearchBar.module.css';

export interface SearchBarProps {
  label: string;
  /** Called with the trimmed query once typing pauses (and on Enter / clear). */
  onSearch: (query: string) => void;
  placeholder?: string;
  initialValue?: string;
  /** Pause before searching, in ms (default 250). Read once, on first use. */
  delayMs?: number;
  /** Keep the label visible above the field. */
  showLabel?: boolean;
}

/**
 * A search field in a role="search" form. Typing is debounced with the
 * closure-based debounce() so a query is sent once, not per keystroke.
 */
export function SearchBar({
  label,
  onSearch,
  placeholder,
  initialValue = '',
  delayMs = 250,
  showLabel = false,
}: SearchBarProps) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const onSearchRef = useRef(onSearch);
  const debouncedRef = useRef<Debounced<[string]> | null>(null);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // A pending search must not fire after the field is gone.
  useEffect(
    () => () => {
      debouncedRef.current?.cancel();
    },
    [],
  );

  // Created on first use, inside event handlers (never during render).
  const debouncedSearch = (): Debounced<[string]> => {
    debouncedRef.current ??= debounce((query: string) => {
      onSearchRef.current(query.trim());
    }, delayMs);
    return debouncedRef.current;
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    debouncedSearch()(event.target.value);
  };

  const clear = () => {
    setValue('');
    debouncedRef.current?.cancel();
    onSearchRef.current('');
    inputRef.current?.focus();
  };

  return (
    <form
      role="search"
      className={styles.search}
      onSubmit={(event) => {
        event.preventDefault();
        const search = debouncedSearch();
        search(value);
        search.flush();
      }}
    >
      <label htmlFor={inputId} className={showLabel ? styles.label : 'visually-hidden'}>
        {label}
      </label>
      <div className={styles.field}>
        <Icon icon={Search} className={styles.icon} />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          className={styles.input}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={handleChange}
        />
        {value && (
          <button type="button" className={styles.clear} onClick={clear}>
            <Icon icon={X} />
            <span className="visually-hidden">Clear search</span>
          </button>
        )}
      </div>
    </form>
  );
}
