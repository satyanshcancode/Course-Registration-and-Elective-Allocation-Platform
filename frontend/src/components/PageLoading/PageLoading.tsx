import { LoadingSpinner } from '../LoadingSpinner';
import { Skeleton } from '../Skeleton';
import styles from './PageLoading.module.css';

export interface PageLoadingProps {
  label?: string;
}

/** Suspense fallback while a lazy-loaded page's code arrives. */
export function PageLoading({ label = 'Loading page…' }: PageLoadingProps) {
  return (
    <div className={styles.loading} aria-busy="true">
      <div className={styles.header}>
        <Skeleton width="8rem" />
        <Skeleton height="2rem" width="16rem" />
      </div>
      <LoadingSpinner label={label} showLabel />
    </div>
  );
}
