import { RotateCcw } from 'lucide-react';
import { Button } from '../Button';
import { ErrorMessage } from '../ErrorMessage';
import styles from './ErrorBoundary.module.css';

export interface ErrorFallbackProps {
  error: unknown;
  /** Re-renders the failed part in place. */
  onRetry?: () => void;
}

function describe(error: unknown): string {
  // Failed lazy chunk after a redeploy is the common real-world case.
  if (error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message)) {
    return 'Part of the app could not be downloaded. Reloading the page usually fixes this.';
  }
  return 'Something unexpected happened while showing this page. Your registration data is safe; nothing was submitted.';
}

/** Shown by ErrorBoundary and the router's error element. */
export function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <section className={styles.fallback} aria-labelledby="error-fallback-title">
      <h1 id="error-fallback-title" className={styles.title}>
        This page ran into a problem
      </h1>
      <ErrorMessage
        title="What happened"
        message={describe(error)}
        onRetry={onRetry}
        retryLabel="Try again"
      />
      <div className={styles.actions}>
        <Button
          variant="ghost"
          iconStart={RotateCcw}
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload the page
        </Button>
      </div>
    </section>
  );
}
