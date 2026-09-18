import { SystemStatusPanel } from '../components/SystemStatusPanel';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useHealthStatus } from '../hooks/useHealthStatus';
import styles from './HomePage.module.css';

export function HomePage() {
  useDocumentTitle('Home');
  const { state, retry } = useHealthStatus();

  return (
    <div className={styles.page}>
      <section className={styles.intro} aria-labelledby="home-title">
        <h1 id="home-title">Course Registration and Elective Allocation</h1>
        <p>
          Browse courses, check your eligibility before the window opens, rank your electives and
          submit once. Oversubscribed electives are allocated fairly using your preferences and
          priority, not by who clicks fastest.
        </p>
      </section>
      <SystemStatusPanel state={state} onRetry={retry} />
    </div>
  );
}
