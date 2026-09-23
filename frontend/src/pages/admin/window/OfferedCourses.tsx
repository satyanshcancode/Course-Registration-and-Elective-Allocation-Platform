import type { WindowCourseOption } from '@course-reg/shared';
import { Checkbox } from '../../../components/Checkbox';
import styles from './OfferedCourses.module.css';

export interface OfferedCoursesProps {
  courses: readonly WindowCourseOption[];
  selected: readonly string[];
  error?: string;
  onChange: (codes: string[]) => void;
}

/**
 * Which courses the window offers. A course that already has requests is
 * flagged, because removing it would throw those requests away.
 */
export function OfferedCourses({ courses, selected, error, onChange }: OfferedCoursesProps) {
  const chosen = new Set(selected);
  const allSelected = courses.length > 0 && chosen.size === courses.length;

  const toggle = (code: string, checked: boolean) => {
    const next = new Set(chosen);
    if (checked) {
      next.add(code);
    } else {
      next.delete(code);
    }
    onChange(courses.filter((course) => next.has(course.code)).map((course) => course.code));
  };

  return (
    <fieldset className={styles.group} aria-describedby={error ? 'offered-error' : undefined}>
      <legend className={styles.legend}>Offered courses</legend>
      <div className={styles.toolbar}>
        <Checkbox
          label={allSelected ? 'Clear all' : 'Select all'}
          checked={allSelected}
          onChange={(event) => {
            onChange(event.target.checked ? courses.map((course) => course.code) : []);
          }}
        />
        <p className={styles.count}>
          {chosen.size} of {courses.length} courses selected
        </p>
      </div>
      {error && (
        <p id="offered-error" className={styles.error} role="alert">
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {courses.map((course) => (
          <li key={course.code}>
            <Checkbox
              label={
                <span className={styles.label}>
                  <span className={styles.code}>{course.code}</span>
                  <span>{course.name}</span>
                </span>
              }
              description={
                <span className={styles.meta}>
                  {course.department.code} · {course.credits} credits
                  {course.capacity !== null && ` · ${course.capacity} seats`}
                  {course.demand > 0 && ` · ${course.demand} requests`}
                </span>
              }
              checked={chosen.has(course.code)}
              onChange={(event) => {
                toggle(course.code, event.target.checked);
              }}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
