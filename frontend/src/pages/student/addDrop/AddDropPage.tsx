import {
  findSeatTaken,
  readAddDropProblems,
  type AddDropCourse,
  type AddDropProblem,
  type AddDropView,
} from '@course-reg/shared';
import { ArrowLeftRight, Hourglass, Lock, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type MouseEvent } from 'react';
import {
  addCourse,
  dropCourse,
  getAddDrop,
  joinWaitlist,
  leaveWaitlist,
  swapCourse,
} from '../../../api/addDropApi';
import { unwrap } from '../../../api/unwrap';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Checkbox } from '../../../components/Checkbox';
import { CourseCode } from '../../../components/CourseCode';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { Icon } from '../../../components/Icon';
import { LiveSeatsIndicator } from '../../../components/LiveSeatsIndicator';
import { PageHeader } from '../../../components/PageHeader';
import { RegistrationStatusBanner } from '../../../components/RegistrationStatusBanner';
import { SearchBar } from '../../../components/SearchBar';
import { SeatMeter } from '../../../components/SeatMeter';
import { Skeleton } from '../../../components/Skeleton';
import { StatusBadge } from '../../../components/StatusBadge';
import { useToast } from '../../../components/Toast';
import { useAsync } from '../../../hooks/useAsync';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { useLiveSeats } from '../../../hooks/useLiveSeats';
import {
  describeHeldSeat,
  describeOutcome,
  describePeriod,
  describeProblem,
  dropConsequence,
} from '../../../utils/addDropText';
import { seatsNewerThan } from '../../../utils/liveSeats';
import { findRowAction } from '../../../utils/tableActions';
import { describeChoice } from '../../../utils/waitlistText';
import styles from './AddDropPage.module.css';

/** The data-action each button carries; one delegated listener reads them. */
const ACTIONS = {
  add: 'add-drop-add',
  waitlist: 'add-drop-waitlist',
  swap: 'add-drop-swap',
  leave: 'add-drop-leave',
} as const;

/**
 * One attempt at one change.
 *
 * The idempotency key belongs to the ATTEMPT, not to the request: if the answer
 * never arrives, pressing the button again reuses this key, and the server
 * replays its first answer instead of moving a second seat.
 */
interface Attempt {
  kind: keyof typeof ACTIONS | 'drop';
  code: string;
  key: string;
}

export function AddDropPage() {
  useDocumentTitle('Add or drop a course');
  const toast = useToast();
  const { state, retry } = useAsync(async (signal) => unwrap(await getAddDrop(signal)));
  // Every action's reply carries the refreshed page, so the newest one wins
  // over whatever the loader last returned — no second request needed.
  const [acted, setActed] = useState<AddDropView | null>(null);
  const view = acted ?? (state.status === 'success' ? state.data : undefined);

  // The armed attempt (which holds the key) outlives a failed request, because
  // a retry must reuse that key. Whether one is IN FLIGHT is separate: after an
  // unreachable request the buttons have to come back, or there is nothing to
  // retry with.
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [problems, setProblems] = useState<readonly AddDropProblem[]>([]);
  const [unreachable, setUnreachable] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState<{ key: string; leaveWaitlists: boolean } | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const live = useLiveSeats({ enabled: view?.period.open === true });
  const seats = view ? seatsNewerThan(live.snapshot, live.seats, view.serverTime) : null;

  /**
   * Runs one action and folds the answer back into the page. Every reply
   * carries the refreshed view, so nothing needs a second request.
   */
  const run = async (
    next: Attempt,
    call: (key: string) => Promise<Awaited<ReturnType<typeof addCourse>>>,
  ) => {
    setAttempt(next);
    setInFlight(true);
    setProblems([]);
    setUnreachable(false);
    const response = await call(next.key);
    setInFlight(false);
    if (response.success) {
      setActed(response.data.view);
      setAttempt(null);
      const message = describeOutcome(response.data.result);
      setAnnouncement(message);
      toast.show({ tone: 'success', title: 'Enrolment updated', message });
      return;
    }
    if (response.httpStatus === null) {
      // The answer never arrived. The key stays armed and the buttons come back
      // enabled, so pressing again retries THIS attempt — which the server
      // replays rather than acting on twice.
      setUnreachable(true);
      return;
    }
    setAttempt(null);
    const refused = readAddDropProblems(response.details);
    setProblems(refused);
    const message = refused[0] ? describeProblem(refused[0]) : response.message;
    setAnnouncement(message);
    // A lost race is not a failure to apologise for: the page offers the queue
    // beside the message, so the toast only needs to say what happened.
    toast.show({ tone: 'warning', title: 'Not changed', message });
    // Seats have moved and the page's numbers have not, so reload — and stop
    // shadowing the loader with the view from the last successful action.
    setActed(null);
    retry();
  };

  /**
   * The attempt to send. An armed attempt for this same action and course is
   * reused key and all — that is what makes a retry safe.
   */
  const attemptFor = (kind: Attempt['kind'], code: string): Attempt =>
    attempt?.kind === kind && attempt.code === code
      ? attempt
      : { kind, code, key: crypto.randomUUID() };

  const onAdd = (code: string) =>
    void run(attemptFor('add', code), (key) => addCourse({ code }, key));

  const onJoinWaitlist = (code: string) =>
    void run(attemptFor('waitlist', code), (key) => joinWaitlist({ code }, key));

  const onSwap = (code: string) => {
    const from = view?.held?.course.code;
    if (!from) {
      return;
    }
    void run(attemptFor('swap', code), (key) => swapCourse({ fromCode: from, toCode: code }, key));
  };

  const onLeave = (code: string) =>
    void run(attemptFor('leave', code), (key) => leaveWaitlist({ code }, key));

  const openDropDialog = () => {
    // Generated ONCE, when the dialog opens, and reused for every retry.
    setConfirmDrop({ key: crypto.randomUUID(), leaveWaitlists: false });
    setUnreachable(false);
  };

  const onConfirmDrop = async () => {
    const held = view?.held;
    if (!confirmDrop || !held) {
      return;
    }
    const code = held.course.code;
    const leaveWaitlists = confirmDrop.leaveWaitlists;
    await run({ kind: 'drop', code, key: confirmDrop.key }, (key) =>
      dropCourse({ code, leaveWaitlists }, key),
    );
    setConfirmDrop(null);
  };

  /** One delegated listener per surface; buttons carry data-* and no onClick. */
  const onSurfaceClick = (event: MouseEvent<HTMLElement>) => {
    const found = findRowAction(event.target, event.currentTarget);
    if (!found) {
      return;
    }
    switch (found.action) {
      case ACTIONS.add:
        onAdd(found.courseCode);
        break;
      case ACTIONS.waitlist:
        onJoinWaitlist(found.courseCode);
        break;
      case ACTIONS.swap:
        onSwap(found.courseCode);
        break;
      case ACTIONS.leave:
        onLeave(found.courseCode);
        break;
      default:
        break;
    }
  };

  const seatTaken = findSeatTaken(problems);
  const filtered = useMemo(() => filterCourses(view, search), [view, search]);

  return (
    <>
      <PageHeader
        title="Add or drop a course"
        kicker={view?.window ? `${view.window.name} · Add/drop` : 'Add/drop'}
        description="Change your enrolment while the add/drop period is open."
        actions={
          view?.period.open ? (
            <LiveSeatsIndicator updatedAt={live.updatedAt} failing={live.failing} />
          ) : undefined
        }
      >
        <RegistrationStatusBanner />
      </PageHeader>

      <div className={styles.body}>
        {/* Announcements only; the numbers themselves are not a live region. */}
        <p className={styles.announcer} aria-live="polite">
          {announcement}
        </p>

        {state.status === 'error' && (
          <ErrorMessage
            title="Add/drop couldn’t be loaded"
            message={state.message}
            onRetry={retry}
          />
        )}

        {(state.status === 'loading' || state.status === 'idle') && (
          <div className={styles.skeleton} aria-hidden="true">
            <Skeleton height="6rem" />
            <Skeleton height="10rem" />
          </div>
        )}

        {view && (
          <>
            {/* While the period is open the page header's countdown already says when
                it closes; repeating it here would be noise. Outside it, this is
                the only place the dates appear. */}
            {!view.period.open && (
              <p className={styles.period}>
                <Icon icon={Lock} size={16} />
                <span>
                  {describePeriod(view.period)}{' '}
                  {view.period.closedReason
                    ? `${view.period.closedReason} You can see your enrolment below, but nothing can be changed.`
                    : ''}
                </span>
              </p>
            )}

            {seatTaken && (
              <div className={styles.race} role="alert">
                <p className={styles.raceTitle}>That seat was just taken</p>
                <p className={styles.raceBody}>
                  Someone else added {seatTaken.code} a moment before you did. All{' '}
                  {seatTaken.capacity} seats are held.
                </p>
                {view.held === null && (
                  <Button
                    variant="primary"
                    iconStart={Hourglass}
                    loading={isPending(attempt, inFlight, 'waitlist', seatTaken.code)}
                    onClick={() => {
                      onJoinWaitlist(seatTaken.code);
                    }}
                  >
                    Join the waitlist for {seatTaken.code}
                  </Button>
                )}
              </div>
            )}

            {unreachable && (
              <p className={styles.retryNote} role="alert">
                We couldn’t confirm your change. Trying again is safe — it won’t move a second seat.
              </p>
            )}

            <HeldSeat
              view={view}
              disabled={!view.period.open || inFlight}
              onDrop={openDropDialog}
            />

            <section aria-labelledby="choices-heading" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 id="choices-heading" className={styles.heading}>
                  {view.held ? 'Courses you could swap into' : 'Courses with a free seat'}
                </h2>
                <SearchBar
                  label="Filter these courses"
                  placeholder="Course code or name"
                  onSearch={setSearch}
                />
              </div>
              <p className={styles.lead}>
                Only courses you are eligible for are listed.{' '}
                {view.held
                  ? 'Swapping moves your seat in one step: if the new course fills up first, you keep the one you have.'
                  : 'Adding needs an empty timetable, which you have.'}
              </p>
              {filtered.available.length === 0 ? (
                <EmptyState title="No course has a free seat right now" headingLevel={3}>
                  <p>
                    Seats free up as students drop them. Join a waitlist below and you will be moved
                    in automatically.
                  </p>
                </EmptyState>
              ) : (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- delegation only: every click comes from a real <button>, which handles the keyboard itself
                <ul className={styles.list} onClick={onSurfaceClick}>
                  {filtered.available.map((course) => (
                    <li key={course.code}>
                      <ChoiceCard
                        course={course}
                        seats={seats}
                        held={view.held !== null}
                        periodOpen={view.period.open}
                        attempt={attempt}
                        inFlight={inFlight}
                        problems={problems}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {filtered.full.length > 0 && (
              <section aria-labelledby="full-heading" className={styles.section}>
                <h2 id="full-heading" className={styles.heading}>
                  Full courses
                </h2>
                <p className={styles.lead}>
                  {view.held
                    ? 'A waitlist place is only offered to a student holding nothing, so drop your course first if you would rather wait for one of these.'
                    : 'Join a queue and you are moved in automatically as soon as a seat frees up — there is nothing to accept and nothing to claim.'}
                </p>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- delegation only: every click comes from a real <button>, which handles the keyboard itself */}
                <ul className={styles.list} onClick={onSurfaceClick}>
                  {filtered.full.map((course) => (
                    <li key={course.code}>
                      <ChoiceCard
                        course={course}
                        seats={seats}
                        held={view.held !== null}
                        periodOpen={view.period.open}
                        attempt={attempt}
                        inFlight={inFlight}
                        problems={problems}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {view.waiting.length > 0 && (
              <section aria-labelledby="waiting-heading" className={styles.section}>
                <h2 id="waiting-heading" className={styles.heading}>
                  Waitlists you are on
                </h2>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- delegation only: every click comes from a real <button>, which handles the keyboard itself */}
                <ul className={styles.list} onClick={onSurfaceClick}>
                  {view.waiting.map((entry) => (
                    <li key={entry.course.code}>
                      <article className={styles.card} data-tone="waiting">
                        <header className={styles.cardHeader}>
                          <h3 className={styles.cardTitle}>
                            <CourseCode code={entry.course.code} size="sm" /> {entry.course.name}
                          </h3>
                          <StatusBadge
                            kind="waitlist"
                            status="WAITING"
                            label={
                              entry.position === null
                                ? 'Waiting'
                                : `#${entry.position} of ${entry.waiting}`
                            }
                          />
                        </header>
                        <dl className={styles.facts}>
                          <div>
                            <dt>Your choice</dt>
                            <dd>{describeChoice(entry.preferenceRank)}</dd>
                          </div>
                          <div>
                            <dt>Seats</dt>
                            <dd>
                              {entry.allocated} of {entry.capacity} taken
                            </dd>
                          </div>
                        </dl>
                        <div className={styles.cardActions}>
                          <Button
                            variant="ghost"
                            iconStart={Trash2}
                            data-action={ACTIONS.leave}
                            data-course-code={entry.course.code}
                            disabled={!view.period.open || inFlight}
                            loading={isPending(attempt, inFlight, 'leave', entry.course.code)}
                          >
                            Leave waitlist
                          </Button>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDrop !== null}
        tone="danger"
        title="Drop this course?"
        message={
          view?.held ? (
            <>
              <p>{dropConsequence(view.held, view.waiting.length)}</p>
              {view.waiting.length > 0 && (
                <Checkbox
                  className={styles.checkbox}
                  label={`Also leave my ${view.waiting.length} waitlist${
                    view.waiting.length === 1 ? '' : 's'
                  }`}
                  description="Otherwise you stay in those queues and can still be moved up later."
                  checked={confirmDrop?.leaveWaitlists ?? false}
                  onChange={(event) => {
                    setConfirmDrop((current) =>
                      current ? { ...current, leaveWaitlists: event.target.checked } : current,
                    );
                  }}
                />
              )}
              {unreachable && (
                <p className={styles.retryNote}>
                  We couldn’t confirm the drop. Trying again is safe — it won’t release a second
                  seat.
                </p>
              )}
            </>
          ) : null
        }
        confirmLabel={unreachable ? 'Try again' : 'Drop the course'}
        onConfirm={onConfirmDrop}
        onCancel={() => {
          setConfirmDrop(null);
          setUnreachable(false);
        }}
      />
    </>
  );
}

/** Whether this exact request is the one in flight, so only it shows a spinner. */
function isPending(
  attempt: Attempt | null,
  inFlight: boolean,
  kind: Attempt['kind'],
  code: string,
): boolean {
  return inFlight && attempt?.kind === kind && attempt.code === code;
}

/** The course filter is local: the whole page arrives in one request. */
function filterCourses(view: AddDropView | undefined, search: string) {
  if (!view) {
    return { available: [], full: [] };
  }
  const query = search.trim().toLowerCase();
  const matches = (course: AddDropCourse) =>
    query === '' ||
    course.code.toLowerCase().includes(query) ||
    course.name.toLowerCase().includes(query);
  // A course the student is already waiting for is listed under their waitlists,
  // where the place in line is. Showing it twice would offer a "Join waitlist"
  // button they cannot use.
  const queued = new Set(view.waiting.map((entry) => entry.course.code));
  return {
    available: view.available.filter(matches),
    full: view.full.filter((course) => matches(course) && !queued.has(course.code)),
  };
}

function HeldSeat({
  view,
  disabled,
  onDrop,
}: {
  view: AddDropView;
  disabled: boolean;
  onDrop: () => void;
}) {
  if (!view.held) {
    return (
      <EmptyState title="You don’t hold an elective" icon={ArrowLeftRight} headingLevel={2}>
        <p>
          {view.period.open
            ? 'Add a course with a free seat below, or join the waitlist for a full one.'
            : 'When add/drop opens you will be able to add a course that still has seats.'}
        </p>
      </EmptyState>
    );
  }

  const { held } = view;
  return (
    <section aria-labelledby="held-heading" className={styles.section}>
      <h2 id="held-heading" className={styles.heading}>
        Your elective
      </h2>
      <article className={styles.card} data-tone="held">
        <header className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>
            <CourseCode code={held.course.code} size="sm" /> {held.course.name}
          </h3>
          <StatusBadge kind="enrollment" status="ACTIVE" />
        </header>
        <p className={styles.lead}>{describeHeldSeat(held)}</p>
        <dl className={styles.facts}>
          <div>
            <dt>Credits</dt>
            <dd>{held.credits}</dd>
          </div>
          <div>
            <dt>Your choice</dt>
            <dd>{describeChoice(held.preferenceRank)}</dd>
          </div>
        </dl>
        <div className={styles.cardActions}>
          <Button variant="danger" iconStart={Trash2} onClick={onDrop} disabled={disabled}>
            Drop {held.course.code}
          </Button>
          <p className={styles.hint}>
            To change course instead, use <strong>Swap</strong> on one of the courses below — your
            seat moves in one step.
          </p>
        </div>
      </article>
    </section>
  );
}

function ChoiceCard({
  course,
  seats,
  held,
  periodOpen,
  attempt,
  inFlight,
  problems,
}: {
  course: AddDropCourse;
  seats: ReturnType<typeof seatsNewerThan>;
  held: boolean;
  periodOpen: boolean;
  attempt: Attempt | null;
  inFlight: boolean;
  problems: readonly AddDropProblem[];
}) {
  const latest = seats?.get(course.code);
  const capacity = latest?.capacity ?? course.capacity;
  const allocated = latest?.allocated ?? course.allocated;
  const available = Math.max(0, capacity - allocated);
  const problem = problems.find(
    (candidate) => 'code' in candidate && candidate.code === course.code,
  );
  const busy = inFlight;

  return (
    <article className={styles.card} data-tone={available > 0 ? 'open' : 'full'}>
      <header className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          <CourseCode code={course.code} size="sm" /> {course.name}
        </h3>
        {course.preferenceRank !== null && (
          <span className={styles.ranked}>
            You ranked this {describeChoice(course.preferenceRank)}
          </span>
        )}
      </header>

      <SeatMeter allocated={allocated} capacity={capacity} label={`Seats in ${course.code}`} />

      {course.waiting > 0 && (
        <p className={styles.queueNote}>
          {course.waiting} {course.waiting === 1 ? 'student is' : 'students are'} waiting for this
          course.
        </p>
      )}

      {problem && <p className={styles.problem}>{describeProblem(problem)}</p>}

      <div className={styles.cardActions}>
        {available > 0 ? (
          held ? (
            <Button
              variant="secondary"
              iconStart={ArrowLeftRight}
              data-action={ACTIONS.swap}
              data-course-code={course.code}
              disabled={!periodOpen || busy}
              loading={isPending(attempt, inFlight, 'swap', course.code)}
            >
              Swap into {course.code}
            </Button>
          ) : (
            <Button
              variant="secondary"
              iconStart={Plus}
              data-action={ACTIONS.add}
              data-course-code={course.code}
              disabled={!periodOpen || busy}
              loading={isPending(attempt, inFlight, 'add', course.code)}
            >
              Add {course.code}
            </Button>
          )
        ) : held ? (
          <p className={styles.hint}>
            <Icon icon={Lock} /> Full, and a waitlist place needs an empty timetable.
          </p>
        ) : (
          <Button
            variant="secondary"
            iconStart={Hourglass}
            data-action={ACTIONS.waitlist}
            data-course-code={course.code}
            disabled={!periodOpen || busy}
            loading={isPending(attempt, inFlight, 'waitlist', course.code)}
          >
            Join waitlist
          </Button>
        )}
      </div>
    </article>
  );
}
