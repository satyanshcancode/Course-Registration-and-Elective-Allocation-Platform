import type { CourseEligibility, EligibilityOverview } from '@course-reg/shared';
import { CalendarDays, Check, CircleSlash, RefreshCw, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { getEligibility } from '../../api/eligibilityApi';
import { unwrap } from '../../api/unwrap';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CourseCode } from '../../components/CourseCode';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { FormField } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { SearchBar } from '../../components/SearchBar';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { Tabs } from '../../components/Tabs';
import { WindowCard } from '../../components/WindowCard';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRegistrationWindow } from '../../hooks/useRegistrationWindow';
import { useServerClock } from '../../hooks/useServerClock';
import { describeEligibilityCount, describeReason } from '../../utils/eligibilityText';
import { formatDateTime } from '../../utils/formatDate';
import { detailPath } from './StudentCoursesPage';
import styles from './EligibilityPage.module.css';

/** Pause after the last keystroke before filtering the list. */
const SEARCH_DELAY_MS = 300;

function matches(course: CourseEligibility, search: string, department: string): boolean {
  if (department && course.department.code !== department) {
    return false;
  }
  if (!search) {
    return true;
  }
  const needle = search.toLowerCase();
  return course.code.toLowerCase().includes(needle) || course.name.toLowerCase().includes(needle);
}

export function EligibilityPage() {
  useDocumentTitle('Eligibility check');
  const { state, retry } = useAsync(async (signal) => unwrap(await getEligibility(signal)));
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  // The same window the sidebar reads: loaded once for the whole student area.
  const registration = useRegistrationWindow();
  const windowState = registration?.state;
  const windowData = windowState?.status === 'success' ? windowState.data : undefined;
  const clock = useServerClock(windowData?.clockOffsetMs ?? 0, windowData !== undefined);

  const data = state.status === 'success' ? state.data : undefined;
  const departments = useMemo(() => departmentOptions(data), [data]);
  const visible = useMemo(
    () => (data?.courses ?? []).filter((course) => matches(course, search, department)),
    [data, search, department],
  );
  const eligible = visible.filter((course) => course.eligible);
  const notEligible = visible.filter((course) => !course.eligible);
  const filtered = search !== '' || department !== '';

  return (
    <>
      <PageHeader
        title="Eligibility check"
        description="Check which courses you are eligible for based on your academic record. Run this before registration opens."
        actions={
          windowData?.window ? (
            <WindowCard window={windowData.window} clock={clock} variant="name" />
          ) : undefined
        }
      />

      <div className={styles.body}>
        {state.status === 'error' && (
          <ErrorMessage
            title="Your eligibility couldn’t be checked"
            message={state.message}
            onRetry={retry}
          />
        )}
        {state.status === 'loading' && <EligibilitySkeleton />}

        {data && (
          <>
            {data.window?.status === 'DRAFT' && (
              <Notice>
                Registration opens {formatDateTime(data.window.startsAt)}. Check now so there are no
                surprises.
              </Notice>
            )}

            <Card
              title="Your academic record"
              titleIcon={CalendarDays}
              headingLevel={2}
              actions={
                <div className={styles.recheck}>
                  <Button variant="primary" size="sm" iconStart={RefreshCw} onClick={retry}>
                    Run check again
                  </Button>
                  <p className={styles.checkedAt}>
                    Last checked: {formatDateTime(data.serverTime)}
                  </p>
                </div>
              }
            >
              <dl className={styles.record}>
                <div>
                  <dt>Programme</dt>
                  <dd>{data.student.program.name}</dd>
                </div>
                <div>
                  <dt>Semester</dt>
                  <dd className={styles.figure}>{data.student.semester}</dd>
                </div>
                <div>
                  <dt>Credits completed</dt>
                  <dd className={styles.figure}>{data.student.creditsCompleted}</dd>
                </div>
                <div className={styles.wide}>
                  <dt>Courses passed ({data.student.completedCourses.length})</dt>
                  <dd>
                    {data.student.completedCourses.length === 0 ? (
                      'None yet'
                    ) : (
                      <ul className={styles.passed}>
                        {data.student.completedCourses.map((course) => (
                          <li key={course.code}>
                            <abbr title={course.name}>
                              <CourseCode code={course.code} />
                            </abbr>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>

            <section className={styles.results} aria-labelledby="eligibility-summary">
              <div className={styles.toolbar}>
                <h2 id="eligibility-summary" className={styles.summary}>
                  {describeEligibilityCount(data.summary.eligibleCount, data.summary.totalCount)}
                </h2>
                <div className={styles.filters}>
                  <div className={styles.search}>
                    <SearchBar
                      label="Search courses"
                      placeholder="Search by code or name..."
                      delayMs={SEARCH_DELAY_MS}
                      onSearch={setSearch}
                    />
                  </div>
                  <FormField label="Department" labelHidden>
                    {(field) => (
                      <Select
                        {...field}
                        className={styles.department}
                        options={departments}
                        placeholder="All departments"
                        value={department}
                        onChange={(event) => {
                          setDepartment(event.target.value);
                        }}
                      />
                    )}
                  </FormField>
                </div>
              </div>

              {visible.length === 0 ? (
                <EmptyState
                  title={filtered ? 'No courses match these filters' : 'No courses are offered yet'}
                  icon={SearchX}
                >
                  {filtered
                    ? 'Try a shorter search, or choose another department.'
                    : 'Courses appear here once the registrar publishes this term’s offerings.'}
                </EmptyState>
              ) : (
                <Card bodyFlush>
                  <Tabs
                    label="Eligibility"
                    tabs={[
                      {
                        id: 'eligible',
                        label: 'Eligible',
                        meta: `(${eligible.length})`,
                        panel: (
                          <CourseGroup
                            title="Eligible courses"
                            courses={eligible}
                            emptyText="No offered course matches your record yet."
                          />
                        ),
                      },
                      {
                        id: 'not-eligible',
                        label: 'Not eligible',
                        meta: `(${notEligible.length})`,
                        panel: (
                          <CourseGroup
                            title="Courses you are not eligible for"
                            courses={notEligible}
                            emptyText="Nothing is out of reach: you can take every course shown."
                          />
                        ),
                      },
                    ]}
                  />
                </Card>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function departmentOptions(data: EligibilityOverview | undefined) {
  const byCode = new Map(
    data?.courses.map((course) => [course.department.code, course.department]),
  );
  return [...byCode.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((department) => ({ value: department.code, label: department.name }));
}

/** Every reason the check found, or the one word that says it found none. */
function Verdict({ course }: { course: CourseEligibility }) {
  if (course.eligible) {
    return (
      <span className={styles.verdictOk}>
        <Icon icon={Check} />
        Eligible
      </span>
    );
  }
  return (
    <ul className={styles.reasons}>
      {course.reasons.map((reason) => (
        <li key={describeReason(reason)}>
          <Icon icon={CircleSlash} className={styles.reasonIcon} />
          <span>{describeReason(reason)}</span>
        </li>
      ))}
    </ul>
  );
}

const COLUMNS: readonly Column<CourseEligibility>[] = [
  {
    id: 'code',
    header: 'Code',
    key: 'code',
    width: '7rem',
    cell: (course) => <CourseCode code={course.code} size="sm" />,
  },
  { id: 'name', header: 'Course', key: 'name' },
  { id: 'credits', header: 'Credits', key: 'credits', align: 'end', width: '5rem' },
  {
    id: 'department',
    header: 'Department',
    accessor: (course) => course.department.code,
    width: '8rem',
  },
  {
    id: 'verdict',
    header: 'Reason / prerequisites',
    // Sorted and filtered on the words the reader can actually see.
    accessor: (course) =>
      course.eligible ? 'Eligible' : course.reasons.map(describeReason).join('; '),
    cell: (course) => <Verdict course={course} />,
  },
  {
    id: 'action',
    header: 'Action',
    accessor: () => null,
    align: 'end',
    width: '5rem',
    searchable: false,
    cell: (course) => (
      <Link to={detailPath(course.code)} className={styles.view}>
        View<span className="visually-hidden"> {course.code}</span>
      </Link>
    ),
  },
];

interface CourseGroupProps {
  title: string;
  courses: readonly CourseEligibility[];
  emptyText: string;
}

/** One tab's courses, as a table. Its own filter is off: the page has one. */
function CourseGroup({ title, courses, emptyText }: CourseGroupProps) {
  return (
    <DataTable
      caption={title}
      captionHidden
      bare
      rows={courses}
      columns={COLUMNS}
      getRowId={(course) => course.code}
      filterable={false}
      itemName={{ one: 'course', other: 'courses' }}
      emptyTitle={title}
      emptyMessage={emptyText}
    />
  );
}

function EligibilitySkeleton() {
  return (
    <div aria-hidden="true" className={styles.skeleton}>
      <Skeleton height="8rem" />
      <Skeleton width="18rem" />
      <Skeleton lines={4} />
    </div>
  );
}
