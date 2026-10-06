import type { StudentWaitlist, StudentWaitlistEntry } from '@course-reg/shared';
import { Archive, Hourglass } from 'lucide-react';
import { getMyWaitlist } from '../../api/waitlistApi';
import { unwrap } from '../../api/unwrap';
import { Card } from '../../components/Card';
import { CourseCode } from '../../components/CourseCode';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { LiveSeatsIndicator } from '../../components/LiveSeatsIndicator';
import { PageHeader } from '../../components/PageHeader';
import { Notice } from '../../components/Notice';
import { SeatMeter } from '../../components/SeatMeter';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { WindowCard } from '../../components/WindowCard';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useLiveSeats } from '../../hooks/useLiveSeats';
import { useRegistrationWindow } from '../../hooks/useRegistrationWindow';
import { useServerClock } from '../../hooks/useServerClock';
import { seatsNewerThan } from '../../utils/liveSeats';
import {
  describeChoice,
  describeEnded,
  describeQueue,
  describeUpgrade,
} from '../../utils/waitlistText';
import styles from './WaitlistPage.module.css';

export function WaitlistPage() {
  useDocumentTitle('Waitlist');
  const { state, retry } = useAsync(async (signal) => unwrap(await getMyWaitlist(signal)));
  const data = state.status === 'success' ? state.data : undefined;
  // Only worth polling while there is a queue on screen to keep current.
  const live = useLiveSeats({ enabled: (data?.waiting.length ?? 0) > 0 });
  // The window the student area already loaded, so the card costs no request.
  const registration = useRegistrationWindow();
  const windowState = registration?.state;
  const windowData = windowState?.status === 'success' ? windowState.data : undefined;
  const clock = useServerClock(windowData?.clockOffsetMs ?? 0, windowData !== undefined);

  return (
    <>
      <PageHeader
        title="Waitlist"
        description="Your place in line for courses that were full, and what happens when a seat frees up."
        actions={
          <>
            {data && data.waiting.length > 0 && (
              <LiveSeatsIndicator updatedAt={live.updatedAt} failing={live.failing} />
            )}
            {windowData?.window && (
              <WindowCard window={windowData.window} clock={clock} variant="name" />
            )}
          </>
        }
      />

      <div className={styles.body}>
        {state.status === 'error' && (
          <ErrorMessage
            title="Your waitlist couldn’t be loaded"
            message={state.message}
            onRetry={retry}
          />
        )}

        {(state.status === 'loading' || state.status === 'idle') && (
          <div className={styles.skeleton} aria-hidden="true">
            <Skeleton height="5rem" />
            <Skeleton height="5rem" />
          </div>
        )}

        {data && <Queues data={data} seats={seatsFor(data, live)} />}
      </div>
    </>
  );
}

/** The polled numbers, but never older than the page's own data. */
function seatsFor(data: StudentWaitlist, live: ReturnType<typeof useLiveSeats>) {
  return seatsNewerThan(live.snapshot, live.seats, data.serverTime);
}

function Queues({ data, seats }: { data: StudentWaitlist; seats: ReturnType<typeof seatsFor> }) {
  if (data.waiting.length === 0 && data.ended.length === 0) {
    return (
      <EmptyState title="You’re not on any waitlist" icon={Hourglass}>
        <p>
          {data.window?.status === 'ALLOCATED'
            ? 'Every course you ranked either had a seat for you or was ruled out, so there is nothing to wait for.'
            : 'If a course you ranked is full when allocation runs, your position will show here, and you’ll be moved in automatically when a seat frees up.'}
        </p>
      </EmptyState>
    );
  }

  return (
    <>
      {data.waiting.length > 0 && (
        <Card title="Waiting for a seat" titleIcon={Hourglass} headingLevel={2}>
          <div className={styles.stack}>
            <Notice>{describeUpgrade(data.held)}</Notice>
            <ol className={styles.list}>
              {data.waiting.map((entry) => (
                <li key={entry.course.code} className={styles.item}>
                  <WaitingCard entry={entry} seats={seats} />
                </li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      {data.ended.length > 0 && (
        <Card title="No longer waiting" titleIcon={Archive} headingLevel={2}>
          <ul className={styles.list}>
            {data.ended.map((entry) => (
              <li key={entry.course.code} className={styles.item}>
                <EndedCard entry={entry} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function WaitingCard({
  entry,
  seats,
}: {
  entry: StudentWaitlistEntry;
  seats: ReturnType<typeof seatsFor>;
}) {
  const latest = seats?.get(entry.course.code);
  const capacity = latest?.capacity ?? entry.capacity;
  const allocated = latest?.allocated ?? entry.allocated;

  return (
    <article className={styles.row}>
      <header className={styles.rowHeader}>
        <h3 className={styles.rowTitle}>
          <CourseCode code={entry.course.code} size="sm" /> {entry.course.name}
        </h3>
        <StatusBadge
          kind="waitlist"
          status="WAITING"
          label={entry.position === null ? 'Waiting' : `#${entry.position} of ${entry.waiting}`}
        />
      </header>

      <QueuePosition position={entry.position} waiting={entry.waiting} code={entry.course.code} />

      <p className={styles.queue}>{describeQueue(entry)}</p>

      <SeatMeter
        allocated={allocated}
        capacity={capacity}
        label={`Seats in ${entry.course.code}`}
      />

      <dl className={styles.facts}>
        <div>
          <dt>Your choice</dt>
          <dd>{describeChoice(entry.preferenceRank)}</dd>
        </div>
        {entry.score > 0 && (
          <div>
            <dt>Your score</dt>
            <dd>{entry.score}</dd>
          </div>
        )}
      </dl>
    </article>
  );
}

/**
 * How far up the line the student is: who is ahead, and a bar for the same
 * thing. The bar fills as the student nears the front and is full at the
 * front. It is drawn only from the position and the queue length the server
 * sent, and only when they agree; otherwise the position stands alone.
 */
function QueuePosition({
  position,
  waiting,
  code,
}: {
  position: number | null;
  waiting: number;
  code: string;
}) {
  if (position === null) {
    return null;
  }
  const ahead = position - 1;
  const aheadText =
    ahead === 0 ? 'You’re next' : `${ahead} ${ahead === 1 ? 'student' : 'students'} ahead of you`;
  // The width is data, as it is in the seat meter; it cannot be a class.
  const drawBar = position >= 1 && waiting >= position;

  return (
    <div className={styles.position}>
      <p className={styles.ahead}>
        <strong>{aheadText}</strong>
        <span className={styles.place}>
          Position {position}
          {waiting > 0 && ` of ${waiting}`}
        </span>
      </p>
      {drawBar && (
        <div
          className={styles.track}
          role="meter"
          aria-label={`Your place in the ${code} queue`}
          aria-valuemin={0}
          aria-valuemax={waiting}
          aria-valuenow={waiting - ahead}
          aria-valuetext={`Position ${position} of ${waiting}, ${ahead === 0 ? 'you are next' : aheadText}`}
        >
          <span
            className={styles.fill}
            style={{ inlineSize: `${((waiting - ahead) / waiting) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function EndedCard({ entry }: { entry: StudentWaitlistEntry }) {
  return (
    <article className={styles.row}>
      <header className={styles.rowHeader}>
        <h3 className={styles.rowTitle}>
          <CourseCode code={entry.course.code} size="sm" /> {entry.course.name}
        </h3>
        <StatusBadge kind="waitlist" status={entry.status} />
      </header>
      <p className={styles.queue}>{describeEnded(entry)}</p>
    </article>
  );
}
