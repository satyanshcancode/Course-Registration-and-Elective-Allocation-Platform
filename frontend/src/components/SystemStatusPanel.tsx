import type { DependencyStatus, HealthStatus } from '@course-reg/shared';
import type { AsyncState } from '../types/asyncState';
import { StatusBadge } from './StatusBadge';
import styles from './SystemStatusPanel.module.css';

interface SystemStatusPanelProps {
  state: AsyncState<HealthStatus>;
  onRetry: () => void;
}

function DependencyBadge({ status }: { status: DependencyStatus }) {
  return status === 'ok' ? (
    <StatusBadge tone="success" label="Operational" />
  ) : (
    <StatusBadge tone="danger" label="Unavailable" />
  );
}

function HealthDetails({ health }: { health: HealthStatus }) {
  return (
    <dl className={styles.details}>
      <div className={styles.row}>
        <dt>API server</dt>
        <dd>
          <StatusBadge tone="success" label="Operational" />
        </dd>
      </div>
      <div className={styles.row}>
        <dt>Database</dt>
        <dd>
          <DependencyBadge status={health.database.status} />
          {health.database.latencyMs !== null && (
            <span className={styles.meta}>{health.database.latencyMs} ms</span>
          )}
        </dd>
      </div>
      <div className={styles.row}>
        <dt>Last checked</dt>
        <dd>
          <time dateTime={health.timestamp}>{new Date(health.timestamp).toLocaleTimeString()}</time>
        </dd>
      </div>
    </dl>
  );
}

export function SystemStatusPanel({ state, onRetry }: SystemStatusPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="system-status-heading" aria-live="polite">
      <header className={styles.header}>
        <h2 id="system-status-heading">System status</h2>
        <button
          type="button"
          className={styles.retry}
          onClick={onRetry}
          disabled={state.status === 'loading'}
        >
          {state.status === 'error' ? 'Retry' : 'Refresh'}
        </button>
      </header>

      {state.status === 'loading' && <p className={styles.message}>Checking services…</p>}

      {state.status === 'error' && (
        <p className={styles.error} role="alert">
          <StatusBadge tone="danger" label="API unreachable" /> {state.message}
        </p>
      )}

      {state.status === 'success' && <HealthDetails health={state.data} />}
    </section>
  );
}
