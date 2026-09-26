import {
  HISTORY_PAGE_SIZE,
  type HistoryEvent,
  type HistoryPage as HistoryPageData,
  type StudentStatus,
} from '@course-reg/shared';
import { History } from 'lucide-react';
import { useCallback, useState } from 'react';
import { getMyHistory, getMyStatus } from '../../api/activityApi';
import { unwrap } from '../../api/unwrap';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CourseCode } from '../../components/CourseCode';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { FormField } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useHistoryFilters } from '../../hooks/useHistoryFilters';
import { formatDate, formatDateTime, formatTime } from '../../utils/formatDate';
import { historyFiltersKey } from '../../utils/historyFilters';
import {
  describeHistoryEvent,
  groupByDay,
  historyEventIcon,
  historyEventLabel,
} from '../../utils/historyText';
import { describeSeatOrigin, describeStanding } from '../../utils/statusText';
import styles from './HistoryPage.module.css';

export function HistoryPage() {
  useDocumentTitle('Registration history');
  const { filters, setFilters } = useHistoryFilters();
  const status = useAsync(async (signal) => unwrap(await getMyStatus(signal)));

  // The first page comes back whenever the filters change; "Load more" appends
  // to `older` rather than refetching, so scrolling back is never undone.
  const first = useAsync(
    async (signal) =>
      unwrap(
        await getMyHistory(
          {
            ...(filters.type ? { type: filters.type } : {}),
            ...(filters.course ? { course: filters.course } : {}),
          },
          signal,
        ),
      ),
    { key: historyFiltersKey(filters) },
  );
  const [older, setOlder] = useState<{
    key: string;
    events: HistoryEvent[];
    /** Null once the list is exhausted, which is not the same as untouched. */
    cursor: string | null;
    loaded: boolean;
  }>({ key: '', events: [], cursor: null, loaded: false });
  const [loadingMore, setLoadingMore] = useState(false);

  const page = first.state.status === 'success' ? first.state.data : undefined;
  const key = historyFiltersKey(filters);
  // Anything appended under different filters is not part of this list.
  const appended = older.key === key ? older : { key, events: [], cursor: null, loaded: false };
  const events = page ? [...page.events, ...appended.events] : [];
  // Once a page has been appended ITS cursor is the truth, including when it
  // is null: falling back to the first page's would offer "Load more" forever.
  const cursor = appended.loaded ? appended.cursor : (page?.nextCursor ?? null);

  const loadMore = useCallback(async () => {
    if (!cursor) {
      return;
    }
    setLoadingMore(true);
    try {
      const response = await getMyHistory({
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.course ? { course: filters.course } : {}),
        cursor,
        limit: HISTORY_PAGE_SIZE,
      });
      if (response.success) {
        setOlder((current) => ({
          key,
          events: [...(current.key === key ? current.events : []), ...response.data.events],
          cursor: response.data.nextCursor,
          loaded: true,
        }));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, filters.course, filters.type, key]);

  return (
    <>
      <PageHeader
        title="Registration history"
        kicker="Your record"
        description="Everything that has happened to your registration, newest first."
      />

      <div className={styles.body}>
        <Standing
          state={status.state.status}
          data={status.state.status === 'success' ? status.state.data : undefined}
          message={status.state.status === 'error' ? status.state.message : ''}
          onRetry={status.retry}
        />

        <section aria-labelledby="timeline-heading" className={styles.timeline}>
          <div className={styles.timelineHeader}>
            <h2 id="timeline-heading" className={styles.heading}>
              Timeline
            </h2>
            {page && <Filters page={page} filters={filters} setFilters={setFilters} />}
          </div>

          {first.state.status === 'error' && (
            <ErrorMessage
              title="Your history couldn’t be loaded"
              message={first.state.message}
              onRetry={first.retry}
            />
          )}

          {(first.state.status === 'loading' || first.state.status === 'idle') && (
            <div className={styles.skeleton} aria-hidden="true">
              <Skeleton height="4rem" />
              <Skeleton height="4rem" />
              <Skeleton height="4rem" />
            </div>
          )}

          {page && events.length === 0 && (
            <NothingYet filtered={filters.type !== null || filters.course !== ''} />
          )}

          {events.length > 0 && <Days events={events} />}

          {cursor && (
            <div className={styles.more}>
              <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** "Where you stand", from /students/me/status. */
function Standing({
  state,
  data,
  message,
  onRetry,
}: {
  state: 'idle' | 'loading' | 'success' | 'error';
  data: StudentStatus | undefined;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card title="Where you stand" kicker="Right now" headingLevel={2}>
      {(state === 'loading' || state === 'idle') && <Skeleton lines={3} />}
      {state === 'error' && (
        <ErrorMessage title="Your status couldn’t be loaded" message={message} onRetry={onRetry} />
      )}
      {data && (
        <div className={styles.standing}>
          <p className={styles.standingLead}>{describeStanding(data)}</p>
          <dl className={styles.facts}>
            <div>
              <dt>Registration</dt>
              <dd>
                {data.window ? (
                  <span className={styles.windowLine}>
                    <StatusBadge kind="window" status={data.window.status} />
                    {data.window.name}
                  </span>
                ) : (
                  'Not scheduled yet'
                )}
              </dd>
            </div>
            <div>
              <dt>Submission</dt>
              <dd>
                {data.submission
                  ? data.submission.status === 'SUBMITTED'
                    ? `${data.submission.reference ?? 'Submitted'} · ${
                        data.submission.submittedAt
                          ? formatDateTime(data.submission.submittedAt)
                          : 'submitted'
                      }`
                    : `Draft · ${data.submission.courseCodes.length} ranked, not submitted`
                  : 'Nothing submitted'}
              </dd>
            </div>
            <div>
              <dt>Your elective</dt>
              <dd>
                {data.held ? (
                  <span className={styles.seat}>
                    <CourseCode code={data.held.course.code} size="sm" /> {data.held.course.name}
                    <span className={styles.origin}>{describeSeatOrigin(data.held)}</span>
                  </span>
                ) : (
                  'No seat yet'
                )}
              </dd>
            </div>
            <div>
              <dt>Waiting for</dt>
              <dd>
                {data.waiting.length === 0
                  ? 'Nothing'
                  : data.waiting
                      .map((entry) =>
                        entry.position === null
                          ? entry.course.code
                          : `${entry.course.code} (#${entry.position} of ${entry.waiting})`,
                      )
                      .join(', ')}
              </dd>
            </div>
            <div>
              <dt>Add/drop</dt>
              <dd>
                {data.addDrop.open
                  ? `Open until ${
                      data.addDrop.closesAt
                        ? formatDateTime(data.addDrop.closesAt)
                        : 'further notice'
                    }`
                  : (data.addDrop.closedReason ?? 'Closed')}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}

function Filters({
  page,
  filters,
  setFilters,
}: {
  page: HistoryPageData;
  filters: ReturnType<typeof useHistoryFilters>['filters'];
  setFilters: ReturnType<typeof useHistoryFilters>['setFilters'];
}) {
  if (page.types.length === 0) {
    return null;
  }
  return (
    <div className={styles.filters}>
      <FormField label="Event">
        {(control) => (
          <Select
            {...control}
            placeholder="All events"
            value={filters.type ?? ''}
            options={page.types.map((type) => ({ value: type, label: historyEventLabel(type) }))}
            onChange={(event) => {
              const value = event.target.value;
              setFilters({ type: value === '' ? null : (value as typeof filters.type) });
            }}
          />
        )}
      </FormField>
      <FormField label="Course">
        {(control) => (
          <Select
            {...control}
            placeholder="All courses"
            value={filters.course}
            options={page.courses.map((course) => ({
              value: course.code,
              label: `${course.code} ${course.name}`,
            }))}
            onChange={(event) => {
              setFilters({ course: event.target.value });
            }}
          />
        )}
      </FormField>
    </div>
  );
}

/** The timeline itself: one ordered list per day, in one ordered list of days. */
function Days({ events }: { events: readonly HistoryEvent[] }) {
  return (
    <ol className={styles.days}>
      {groupByDay(events).map((group) => (
        <li key={group.day}>
          <h3 className={styles.day}>
            <time dateTime={group.day}>{formatDate(group.events[0]?.at ?? group.day)}</time>
          </h3>
          <ol className={styles.events}>
            {group.events.map((event) => (
              <li key={event.id}>
                <Event event={event} />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function Event({ event }: { event: HistoryEvent }) {
  const type = event.detail.type;
  return (
    <article className={styles.event}>
      <span className={styles.marker} aria-hidden="true">
        <Icon icon={historyEventIcon(type)} size={16} />
      </span>
      <div className={styles.eventText}>
        <p className={styles.eventHead}>
          <span className={styles.eventLabel}>{historyEventLabel(type)}</span>
          <time dateTime={event.at} className={styles.eventTime} title={formatDateTime(event.at)}>
            {formatTime(event.at)}
          </time>
        </p>
        <p className={styles.eventBody}>{describeHistoryEvent(event)}</p>
      </div>
    </article>
  );
}

function NothingYet({ filtered }: { filtered: boolean }) {
  return (
    <EmptyState
      title={filtered ? 'Nothing matches those filters' : 'Nothing recorded yet'}
      icon={History}
      headingLevel={3}
    >
      <p>
        {filtered
          ? 'Try "All events" and "All courses" to see your whole timeline.'
          : 'Submitting your cart, allocation, waitlist moves, adds and drops will each be listed here with the date and time.'}
      </p>
    </EmptyState>
  );
}
