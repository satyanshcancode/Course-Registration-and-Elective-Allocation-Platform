import type { CatalogueCourse } from '@course-reg/shared';
import { LayoutGrid, SearchX, Table2, type LucideIcon } from 'lucide-react';
import { useRef, useState, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { CourseCard } from '../../components/CourseCard';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { LiveSeatsIndicator } from '../../components/LiveSeatsIndicator';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { RegistrationStatusBanner } from '../../components/RegistrationStatusBanner';
import { useToast } from '../../components/Toast';
import { useCart } from '../../hooks/useCart';
import { CATALOGUE_PAGE, useCatalogue, type CatalogueData } from '../../hooks/useCatalogue';
import { useCatalogueFilters } from '../../hooks/useCatalogueFilters';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useLiveSeats } from '../../hooks/useLiveSeats';
import { cartActionFor, CART_ACTIONS } from '../../utils/cartActions';
import { hasActiveFilters, type CatalogueView } from '../../utils/catalogueFilters';
import { scrollIntoViewIfNeeded } from '../../utils/domUtils';
import { seatsNewerThan, withLiveSeats } from '../../utils/liveSeats';
import { findRowAction } from '../../utils/tableActions';
import { CatalogueFilterForm } from './catalogue/CatalogueFilterForm';
import { CatalogueTable } from './catalogue/CatalogueTable';
import styles from './StudentCoursesPage.module.css';

/** Passed to the detail page, so its back link restores the catalogue's filters. */
export interface CatalogueLinkState {
  catalogueSearch: string;
}

const VIEWS: readonly { id: CatalogueView; label: string; icon: LucideIcon }[] = [
  { id: 'cards', label: 'Cards', icon: LayoutGrid },
  { id: 'table', label: 'Table', icon: Table2 },
];

export function detailPath(code: string): string {
  return `/student/courses/${encodeURIComponent(code)}`;
}

function resultSummary(data: CatalogueData): string {
  const { page, pageSize, totalItems } = data.page;
  if (totalItems === 0) {
    return '0 courses';
  }
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  return `Showing ${first}–${last} of ${totalItems} ${totalItems === 1 ? 'course' : 'courses'}`;
}

export function StudentCoursesPage() {
  useDocumentTitle('Course catalogue');
  const { filters, setFilters, clear } = useCatalogueFilters();
  const { state, retry } = useCatalogue(filters);
  const live = useLiveSeats();
  const cart = useCart();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const resultsRef = useRef<HTMLElement>(null);
  // Bumped to remount the form, which resets its search box.
  const [formKey, setFormKey] = useState(0);

  // While new filters load, keep showing the previous results (dimmed).
  const data =
    state.status === 'success'
      ? state.data
      : state.status === 'loading'
        ? state.previous
        : undefined;
  const refreshing = state.status === 'loading' && data !== undefined;
  const filtered = hasActiveFilters(filters);
  const linkState: CatalogueLinkState = { catalogueSearch: location.search };

  // Newer polled numbers replace the loaded ones; unchanged courses keep identity.
  const seats = data ? seatsNewerThan(live.snapshot, live.seats, data.page.serverTime) : null;
  const courses: CatalogueCourse[] = data
    ? data.page.items.map((course) => withLiveSeats(course, seats))
    : [];

  const clearAll = () => {
    setFormKey((key) => key + 1);
    clear();
  };

  /**
   * One place both views send their cart clicks: the table's delegated tbody
   * listener and the card grid's delegated list listener.
   */
  const runCartAction = (action: string, code: string) => {
    if (!cart) {
      return;
    }
    const adding = action === CART_ACTIONS.add;
    void (adding ? cart.add(code) : cart.remove(code)).then((result) => {
      toast.show(
        result.ok
          ? { tone: 'success', title: adding ? `${code} added to your cart` : `${code} removed` }
          : { tone: 'warning', title: 'Your cart wasn’t changed', message: result.message },
      );
    });
  };

  // The cards live in a <ul>; one listener on it serves every card's button.
  const handleGridClick = (event: MouseEvent<HTMLUListElement>) => {
    const found = findRowAction(event.target, event.currentTarget);
    if (found) {
      runCartAction(found.action, found.courseCode);
    }
  };
  const goToPage = (page: number) => {
    setFilters({ page });
    scrollIntoViewIfNeeded(resultsRef);
  };

  return (
    <>
      <PageHeader
        title="Course catalogue"
        kicker={data?.window ? `${data.window.name} · Registration` : 'Registration'}
        description="Every course offered this term, with live seat counts, demand and whether you can take it."
      >
        <div className={styles.statusLine}>
          <RegistrationStatusBanner />
          <LiveSeatsIndicator updatedAt={live.updatedAt} failing={live.failing} />
        </div>
      </PageHeader>

      <div className={styles.body}>
        <CatalogueFilterForm
          key={formKey}
          filters={filters}
          options={data?.page.filterOptions ?? { departments: [], credits: [] }}
          onChange={setFilters}
          onClear={clearAll}
        />

        <section
          ref={resultsRef}
          className={styles.results}
          aria-labelledby="catalogue-results-heading"
          aria-busy={state.status === 'loading' || undefined}
        >
          <div className={styles.toolbar}>
            <h2 id="catalogue-results-heading" className={styles.summary} aria-live="polite">
              {data ? resultSummary(data) : 'Loading courses…'}
            </h2>
            <div className={styles.views} role="group" aria-label="View">
              {VIEWS.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={styles.viewButton}
                  aria-pressed={filters.view === view.id}
                  onClick={() => {
                    setFilters({ view: view.id });
                  }}
                >
                  <Icon icon={view.icon} />
                  {view.label}
                </button>
              ))}
            </div>
          </div>

          {state.status === 'error' && (
            <ErrorMessage
              title="The catalogue couldn’t be loaded"
              message={state.message}
              onRetry={retry}
            />
          )}

          {!data && state.status !== 'error' && <CatalogueSkeleton />}

          {data && courses.length === 0 && (
            <EmptyState
              title={filtered ? 'No courses match these filters' : 'No courses offered yet'}
              icon={SearchX}
              action={
                filtered && (
                  <Button variant="secondary" onClick={clearAll}>
                    Clear filters
                  </Button>
                )
              }
            >
              {filtered
                ? 'Try a shorter search, or turn off some filters.'
                : 'Courses appear here once the registrar publishes this term’s offerings.'}
            </EmptyState>
          )}

          {data && courses.length > 0 && (
            <div className={styles.list} data-refreshing={refreshing ? 'true' : undefined}>
              {filters.view === 'cards' ? (
                /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- delegation only: the clicks come from real buttons inside the cards */
                <ul className={styles.grid} onClick={handleGridClick}>
                  {courses.map((course) => (
                    <li key={course.code} className={styles.cell}>
                      <CourseCard
                        course={course}
                        to={detailPath(course.code)}
                        linkState={linkState}
                        seatsChanged={live.changed.has(course.code)}
                        cartAction={cartActionFor(
                          course.code,
                          course.personal?.eligibility,
                          cart?.snapshot ?? null,
                        )}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <CatalogueTable
                  caption={`Course catalogue: ${resultSummary(data)}`}
                  courses={courses}
                  changed={live.changed}
                  cart={cart?.snapshot ?? null}
                  actions={{
                    view: (code) => {
                      void navigate(detailPath(code), { state: linkState });
                    },
                    [CART_ACTIONS.add]: (code) => {
                      runCartAction(CART_ACTIONS.add, code);
                    },
                    [CART_ACTIONS.remove]: (code) => {
                      runCartAction(CART_ACTIONS.remove, code);
                    },
                  }}
                />
              )}
              <Pagination
                page={data.page.page}
                pageCount={data.page.totalPages}
                onPageChange={goToPage}
                label="Catalogue pages"
              />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** Card-shaped placeholders while the first page loads. */
function CatalogueSkeleton() {
  return (
    <ul className={styles.grid} aria-hidden="true">
      {Array.from({ length: Math.min(CATALOGUE_PAGE, 6) }, (_, index) => (
        <li key={index} className={styles.skeletonCard}>
          <Skeleton width="45%" />
          <Skeleton height="1.4rem" width="75%" />
          <Skeleton lines={2} />
          <Skeleton height="6px" />
          <Skeleton width="55%" />
        </li>
      ))}
    </ul>
  );
}
