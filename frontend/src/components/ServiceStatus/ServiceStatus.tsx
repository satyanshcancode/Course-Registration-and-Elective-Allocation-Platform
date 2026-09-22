import { CircleCheck, CircleX, RefreshCw } from 'lucide-react';
import { useHealthStatus } from '../../hooks/useHealthStatus';
import { Badge } from '../Badge';
import { Button } from '../Button';
import styles from './ServiceStatus.module.css';

export interface ServiceStatusProps {
  heading?: string;
}

/** Compact live check of the API and database (GET /api/health). */
export function ServiceStatus({ heading = 'Service status' }: ServiceStatusProps) {
  const { state, retry } = useHealthStatus();

  return (
    <section className={styles.status} aria-label={heading} aria-live="polite">
      <p className={styles.heading}>{heading}</p>
      {(state.status === 'loading' || state.status === 'idle') && (
        <p className={styles.checking}>Checking the server…</p>
      )}
      {state.status === 'error' && (
        <div className={styles.row}>
          <Badge tone="danger" icon={CircleX}>
            Server unreachable
          </Badge>
          <Button size="sm" variant="ghost" iconStart={RefreshCw} onClick={retry}>
            Check again
          </Button>
        </div>
      )}
      {state.status === 'success' && (
        <dl className={styles.list}>
          <div className={styles.row}>
            <dt>API</dt>
            <dd>
              <Badge tone="success" icon={CircleCheck}>
                Operational
              </Badge>
            </dd>
          </div>
          <div className={styles.row}>
            <dt>Database</dt>
            <dd>
              {state.data.database.status === 'ok' ? (
                <Badge tone="success" icon={CircleCheck}>
                  Operational
                </Badge>
              ) : (
                <Badge tone="danger" icon={CircleX}>
                  Unavailable
                </Badge>
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
