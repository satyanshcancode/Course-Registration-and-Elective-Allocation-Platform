import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '../Button';
import { Icon } from '../Icon';
import styles from './ErrorMessage.module.css';

export interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
}

/** A failed load: what went wrong, plus a way to try again. */
export function ErrorMessage({
  title = "This couldn't be loaded",
  message,
  onRetry,
  retryLabel = 'Try again',
  retrying = false,
}: ErrorMessageProps) {
  return (
    <div className={styles.error} role="alert">
      <Icon icon={TriangleAlert} size={20} className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <p className={styles.message}>{message}</p>
        {onRetry && (
          <Button
            size="sm"
            variant="secondary"
            iconStart={RefreshCw}
            loading={retrying}
            onClick={onRetry}
            className={styles.retry}
          >
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
