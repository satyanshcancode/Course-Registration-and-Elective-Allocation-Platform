import type {
  AllocationExplanation,
  StudentAllocationResult,
  StudentAllocationResults,
} from '@course-reg/shared';
import { CircleCheck, Hourglass, ListChecks } from 'lucide-react';
import { CourseCode } from '../../components/CourseCode';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { RegistrationStatusBanner } from '../../components/RegistrationStatusBanner';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { getMyAllocationResults } from '../../api/allocationApi';
import { unwrap } from '../../api/unwrap';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { describeOutcome, describeScore, explainResult } from '../../utils/allocationText';
import { formatDate, formatDateTime } from '../../utils/formatDate';
import styles from './ResultsPage.module.css';

export function ResultsPage() {
  useDocumentTitle('Allocation results');
  const { state, retry } = useAsync(async (signal) => unwrap(await getMyAllocationResults(signal)));

  const data = state.status === 'success' ? state.data : undefined;
  const windowName = data?.window?.name;

  return (
    <>
      <PageHeader
        title="Allocation results"
        kicker={windowName ? `${windowName} · Results` : 'Results'}
        description="Which course you were allocated, and exactly why."
      >
        <RegistrationStatusBanner />
      </PageHeader>

      <div className={styles.body}>
        {state.status === 'error' && (
          <ErrorMessage
            title="Your results couldn’t be loaded"
            message={state.message}
            onRetry={retry}
          />
        )}

        {(state.status === 'loading' || state.status === 'idle') && (
          <div className={styles.skeleton} aria-hidden="true">
            <Skeleton height="6rem" />
            <Skeleton height="4rem" />
            <Skeleton height="4rem" />
          </div>
        )}

        {data && (data.ranAt === null ? <Pending data={data} /> : <Published data={data} />)}
      </div>
    </>
  );
}

/** Before allocation: say plainly when the result will exist. */
function Pending({ data }: { data: StudentAllocationResults }) {
  return (
    <EmptyState title="Results aren’t out yet" icon={ListChecks}>
      <p>
        {data.window
          ? `Allocation runs once registration closes on ${formatDate(data.window.endsAt)}. Your result will appear here, and you’ll get a notification.`
          : 'Registration has not been scheduled yet.'}
      </p>
    </EmptyState>
  );
}

/** After allocation: the outcome first, then every course they ranked. */
function Published({ data }: { data: StudentAllocationResults }) {
  return (
    <>
      <Headline allocated={data.allocated} ranAt={data.ranAt ?? ''} />
      <section aria-labelledby="results-heading" className={styles.list}>
        <h2 id="results-heading" className={styles.heading}>
          Every course you ranked
        </h2>
        {data.results.length === 0 ? (
          <EmptyState title="You didn’t rank any courses" icon={ListChecks} headingLevel={3}>
            <p>Nothing was submitted for this window, so there is nothing to allocate.</p>
          </EmptyState>
        ) : (
          <ol className={styles.results}>
            {data.results.map((result) => (
              <li key={result.explanation.course.code}>
                <ResultCard result={result} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

/** The one thing a student wants first: did I get a seat, and in what? */
function Headline({
  allocated,
  ranAt,
}: {
  allocated: AllocationExplanation | null;
  ranAt: string;
}) {
  return (
    <section className={styles.headline} data-allocated={allocated ? 'true' : 'false'}>
      <p className={styles.mark}>
        <Icon icon={allocated ? CircleCheck : Hourglass} />
        <span>{allocated ? 'You have a seat' : 'No seat this round'}</span>
      </p>
      {allocated ? (
        <>
          <h2 className={styles.headlineTitle}>
            <CourseCode code={allocated.course.code} /> {allocated.course.name}
          </h2>
          <p className={styles.headlineNote}>
            Your {ordinalWord(allocated.preferenceRank)} choice. Allocation ran on{' '}
            {formatDateTime(ranAt)}.
          </p>
        </>
      ) : (
        <>
          <h2 className={styles.headlineTitle}>None of your choices had a seat left</h2>
          <p className={styles.headlineNote}>
            You are on the waitlist for the courses you ranked and move up automatically when seats
            free up. Allocation ran on {formatDateTime(ranAt)}.
          </p>
        </>
      )}
    </section>
  );
}

function ordinalWord(rank: number): string {
  return ['first', 'second', 'third', 'fourth', 'fifth'][rank - 1] ?? `${rank}th`;
}

function ResultCard({ result }: { result: StudentAllocationResult }) {
  const { explanation } = result;
  const { course, score } = explanation;

  return (
    <article className={styles.card} data-outcome={result.outcome}>
      <header className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          <CourseCode code={course.code} size="sm" /> {course.name}
        </h3>
        <StatusBadge
          kind="allocation"
          status={result.outcome}
          label={describeOutcome(explanation)}
        />
      </header>

      <div className={styles.explanation}>
        {explainResult(explanation).map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </div>

      {score && (
        <details className={styles.breakdown}>
          <summary>How your score was worked out</summary>
          <dl className={styles.scoreList}>
            <div>
              <dt>{ordinalWord(score.preferenceRank)} preference</dt>
              <dd>{score.preferencePoints}</dd>
            </div>
            {score.bonuses.map((bonus) => (
              <div key={bonus.type}>
                <dt>{bonusLabel(bonus.type)}</dt>
                <dd>+{bonus.points}</dd>
              </div>
            ))}
            <div className={styles.scoreTotal}>
              <dt>Total</dt>
              <dd>{score.total}</dd>
            </div>
          </dl>
          <p className={styles.scoreNote}>{describeScore(score)}</p>
        </details>
      )}
    </article>
  );
}

function bonusLabel(type: 'FINAL_YEAR' | 'PROGRAM_RELEVANCE' | 'GRADUATION_URGENCY'): string {
  switch (type) {
    case 'FINAL_YEAR':
      return 'Final year';
    case 'PROGRAM_RELEVANCE':
      return 'Programme relevance';
    case 'GRADUATION_URGENCY':
      return 'Graduating this term';
  }
}
