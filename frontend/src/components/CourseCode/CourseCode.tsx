import styles from './CourseCode.module.css';

export interface CourseCodeProps {
  code: string;
  size?: 'sm' | 'md';
}

/** A course code set like a catalogue label: "CS401". */
export function CourseCode({ code, size = 'md' }: CourseCodeProps) {
  return (
    <span className={styles.code} data-size={size} translate="no">
      {code}
    </span>
  );
}
