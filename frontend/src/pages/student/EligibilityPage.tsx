import type { CourseEligibility, EligibilityOverview } from '@course-reg/shared';
import { CircleSlash, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getEligibility } from '../../api/eligibilityApi';
import { unwrap } from '../../api/unwrap';
import { Card } from '../../components/Card';
import { CourseCode } from '../../components/CourseCode';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { FormField } from '../../components/FormField';
import { PageHeader } from '../../components/PageHeader';
import { RegistrationStatusBanner } from '../../components/RegistrationStatusBanner';
import { SearchBar } from '../../components/SearchBar';
import { Select } from '../../components/Select';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { describeEligibilityCount, describeReason } from '../../utils/eligibilityText';
import { formatDateTime } from '../../utils/formatDate';
import { Link } from 'react-router';
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
        kicker="Registration · Before you rank courses"
        description="Every course offered this term, checked against your record. Run it before registration opens so there are no surprises."
      >
        <RegistrationStatusBanner />
      </PageHeader>

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
              <p className={styles.notice}>
                Registration opens {formatDateTime(data.window.startsAt)} — check now so there are
                no surprises.
              </p>
            )}

            <Card title="Your record" kicker="What this check uses" headingLevel={2}>
              <dl className={styles.record}>
                <div>
                  <dt>Programme</dt>
                  <dd>{data.student.program.name}</dd>
                </div>
                <div>
                  <dt>Semester</dt>
                  <dd className={styles.mono}>{data.student.semester}</dd>
                </div>
                <div>
                  <dt>Credits completed</dt>
                  <dd className={styles.mono}>{data.student.creditsCompleted}</dd>
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
                            <CourseCode code={course.code} size="sm" />
                            <span className={styles.passedName}>{course.name}</span>
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
                  <SearchBar
                    label="Search courses"
                    placeholder="Search by code or name"
                    delayMs={SEARCH_DELAY_MS}
                    onSearch={setSearch}
                  />
                  <FormField label="Department" labelHidden>
                    {(field) => (
                      <Select
                        {...field}
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
                <>
                  <CourseGroup
                    id="eligible"
                    title="Eligible"
                    status="ELIGIBLE"
                    courses={eligible}
                    emptyText="No offered course matches your record yet."
                  />
                  <CourseGroup
                    id="not-eligible"
                    title="Not eligible"
                    status="NOT_ELIGIBLE"
                    courses={notEligible}
                    emptyText="Nothing is out of reach — you can take every course shown."
                  />
                </>
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

interface CourseGroupProps {
  id: string;
  title: string;
  status: 'ELIGIBLE' | 'NOT_ELIGIBLE';
  courses: readonly CourseEligibility[];
  emptyText: string;
}

/**
 * One collapsible group. A native <details> keeps the disclosure keyboard
 * accessible and searchable without any JavaScript.
 */
function CourseGroup({ id, title, status, courses, emptyText }: CourseGroupProps) {
  return (
    <details className={styles.group} open data-status={status}>
      <summary className={styles.groupSummary}>
        <StatusBadge kind="eligibility" status={status} />
        <span className={styles.groupTitle}>
          {title} · {courses.length}
        </span>
      </summary>
      {courses.length === 0 ? (
        <p className={styles.groupEmpty}>{emptyText}</p>
      ) : (
        <ul className={styles.courses} aria-label={`${title} courses`}>
          {courses.map((course) => (
            <li key={course.code} className={styles.course} id={`${id}-${course.code}`}>
              <div className={styles.courseHead}>
                <CourseCode code={course.code} size="sm" />
                <Link to={detailPath(course.code)} className={styles.courseName}>
                  {course.name}
                </Link>
                <span className={styles.courseMeta}>
                  {course.credits} credits · {course.department.code}
                </span>
              </div>
              {course.reasons.length > 0 && (
                <ul className={styles.reasons}>
                  {course.reasons.map((reason) => (
                    <li key={describeReason(reason)}>
                      <CircleSlash aria-hidden="true" className={styles.reasonIcon} />
                      <span>{describeReason(reason)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
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
