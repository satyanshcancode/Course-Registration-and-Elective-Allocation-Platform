import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
  /** Small trailing text, e.g. a count. */
  meta?: ReactNode;
  panel: ReactNode;
}

export interface TabsProps<Id extends string> {
  /** Accessible name of the tab list. */
  label: string;
  tabs: readonly TabItem<Id>[];
  defaultSelectedId?: Id;
  /** Controlled selection (pair with onSelect). */
  selectedId?: Id;
  onSelect?: (id: Id) => void;
}

const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * ARIA tabs with a roving tabindex: Tab enters the list at the selected tab,
 * arrow keys (and Home/End) move between tabs and select them.
 */
export function Tabs<Id extends string>({
  label,
  tabs,
  defaultSelectedId,
  selectedId,
  onSelect,
}: TabsProps<Id>) {
  const baseId = useId();
  const [internalId, setInternalId] = useState<Id | undefined>(defaultSelectedId);
  const activeId = selectedId ?? internalId ?? tabs[0]?.id;
  const tabRefs = useRef(new Map<Id, HTMLButtonElement>());

  const select = (id: Id) => {
    setInternalId(id);
    onSelect?.(id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!NAVIGATION_KEYS.has(event.key)) {
      return;
    }
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === activeId);
    const last = tabs.length - 1;
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowRight'
            ? (index + 1) % tabs.length
            : (index - 1 + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (next) {
      select(next.id);
      tabRefs.current.get(next.id)?.focus();
    }
  };

  const tabId = (id: Id) => `${baseId}-tab-${id}`;
  const panelId = (id: Id) => `${baseId}-panel-${id}`;

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {tabs.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                if (element) {
                  tabRefs.current.set(tab.id, element);
                } else {
                  tabRefs.current.delete(tab.id);
                }
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              className={styles.tab}
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onKeyDown={handleKeyDown}
              onClick={() => {
                select(tab.id);
              }}
            >
              {tab.label}
              {tab.meta !== undefined && <span className={styles.meta}>{tab.meta}</span>}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(tab.id)}
          aria-labelledby={tabId(tab.id)}
          className={styles.panel}
          hidden={tab.id !== activeId}
          tabIndex={0}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
