import type { StudentWaitlist, StudentWaitlistEntry } from '@course-reg/shared';
import { Hourglass } from 'lucide-react';
import { getMyWaitlist } from '../../api/waitlistApi';
import { unwrap } from '../../api/unwrap';
import { CourseCode } from '../../components/CourseCode';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { LiveSeatsIndicator } from '../../components/LiveSeatsIndicator';
import { PageHeader } from '../../components/PageHeader';
import { RegistrationStatusBanner } from '../../components/RegistrationStatusBanner';
import { SeatMeter } from '../../components/SeatMeter';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useLiveSeats } from '../../hooks/useLiveSeats';
import { ordinal } from '../../utils/allocationText';
import { seatsNewerThan } from '../../utils/liveSeats';
import { describeEnded, describeQueue, describeUpgrade } from '../../utils/waitlistText';
import styles from './WaitlistPage.module.css';

export function WaitlistPage() {
  useDocumentTitle('Waitlist');
  const { state, retry } = useAsync(async (signal) => unwrap(await getMyWaitlist(signal)));
  const data = state.status === 'success' ? state.data : undefined;
  // Only worth polling while there is a queue on screen to keep current.
  const live = useLiveSeats({ enabled: (data?.waiting.length ?? 0) > 0 });

  return (
    <>
      <PageHeader
        title="Waitlist"
        kicker={data?.window ? `${data.window.name} · Waitlist` : 'Waitlist'}
        description="Your place in line for courses that were full, and what happens when a seat frees up."
        actions={
          data && data.waiting.length > 0 ? (
            <LiveSeatsIndicator updatedAt={live.updatedAt} failing={live.failing} />
          ) : undefined
        }
      >
        <RegistrationStatusBanner />
      </PageHeader>

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
        <section aria-labelledby="waiting-heading" className={styles.section}>
          <h2 id="waiting-heading" className={styles.heading}>
            Waiting for a seat
          </h2>
          <p className={styles.lead}>{describeUpgrade(data.held)}</p>
          <ol className={styles.list}>
            {data.waiting.map((entry) => (
              <li key={entry.course.code}>
                <WaitingCard entry={entry} seats={seats} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.ended.length > 0 && (
        <section aria-labelledby="ended-heading" className={styles.section}>
          <h2 id="ended-heading" className={styles.heading}>
            No longer waiting
          </h2>
          <ul className={styles.list}>
            {data.ended.map((entry) => (
              <li key={entry.course.code}>
                <EndedCard entry={entry} />
              </li>
            ))}
          </ul>
        </section>
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
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          <CourseCode code={entry.course.code} size="sm" /> {entry.course.name}
        </h3>
        <StatusBadge
          kind="waitlist"
          status="WAITING"
          label={entry.position === null ? 'Waiting' : `#${entry.position} of ${entry.waiting}`}
        />
      </header>

      <p className={styles.queue}>{describeQueue(entry)}</p>

      <SeatMeter
        allocated={allocated}
        capacity={capacity}
        label={`Seats in ${entry.course.code}`}
      />

      <dl className={styles.facts}>
        <div>
          <dt>Your choice</dt>
          <dd>{ordinal(entry.preferenceRank)}</dd>
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

function EndedCard({ entry }: { entry: StudentWaitlistEntry }) {
  return (
    <article className={styles.card} data-ended="true">
      <header className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          <CourseCode code={entry.course.code} size="sm" /> {entry.course.name}
        </h3>
        <StatusBadge kind="waitlist" status={entry.status} />
      </header>
      <p className={styles.queue}>{describeEnded(entry)}</p>
    </article>
  );
}
