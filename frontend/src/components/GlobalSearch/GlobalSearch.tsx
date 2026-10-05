import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '../Icon';
import styles from './GlobalSearch.module.css';

export interface GlobalSearchProps {
  /** The catalogue this search opens, e.g. "/student/courses". */
  to: string;
  /** Visible label for assistive technology; the field itself shows a placeholder. */
  label?: string;
}

/**
 * Apple keyboards print ⌘ where everyone else prints Ctrl, and the shortcut
 * below follows the same split. Reading the platform once, at module scope,
 * keeps the hint and the handler from ever disagreeing.
 */
const IS_APPLE = /mac|iphone|ipad|ipod/i.test(
  typeof navigator === 'undefined' ? '' : navigator.userAgent,
);

/**
 * The catalogue search in the app header.
 *
 * It is a real form: submitting navigates to the catalogue with `search` in
 * the query string, which is where catalogue filters already live
 * (utils/catalogueFilters.ts), so the result is shareable and survives a
 * refresh. Ctrl+K — ⌘K on an Apple keyboard — puts the cursor here from
 * anywhere in the app.
 */
export function GlobalSearch({ to, label = 'Search courses' }: GlobalSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const id = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(IS_APPLE ? event.metaKey : event.ctrlKey)) {
        return;
      }
      // The browser's own "search the page" bindings are not on this key;
      // preventing the default stops the Chrome search-engine shortcut only.
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <form
      className={styles.form}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const search = value.trim();
        void navigate(search ? `${to}?search=${encodeURIComponent(search)}` : to);
      }}
    >
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <Icon icon={Search} className={styles.icon} />
      <input
        ref={inputRef}
        id={id}
        className={styles.input}
        type="search"
        name="search"
        value={value}
        placeholder="Search courses, codes or departments..."
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      {/* Decorative: the shortcut is announced by the field's own label. */}
      <kbd className={styles.hint} aria-hidden="true">
        {IS_APPLE ? '⌘ K' : 'Ctrl K'}
      </kbd>
    </form>
  );
}
