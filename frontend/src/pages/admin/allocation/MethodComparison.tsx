import type { AllocationPreviewMethod } from '@course-reg/shared';
import { COMPARISON_METRICS } from '../../../utils/allocationText';
import styles from './AllocationRunsPage.module.css';

export interface MethodComparisonProps {
  methods: readonly AllocationPreviewMethod[];
  caption: string;
}

const METHOD_LABELS: Record<string, string> = {
  FCFS: 'First come, first served',
  PREFERENCE_PRIORITY: 'Preference + Priority',
};

/**
 * The two methods side by side, as a real table: the rows are metrics and the
 * columns are methods, which is exactly what a `<table>` is for. Each row says
 * which way is better in words, so nothing depends on a colour.
 */
export function MethodComparison({ methods, caption }: MethodComparisonProps) {
  /** The method that leads on a row, or null when it is a draw or not a ranking. */
  const leaderFor = (metric: (typeof COMPARISON_METRICS)[number]) => {
    const scored = methods
      .map((method) => ({ method, value: metric.compare(method.metrics) }))
      .filter(
        (entry): entry is { method: AllocationPreviewMethod; value: number } =>
          entry.value !== null,
      );
    if (scored.length < 2) {
      return null;
    }
    const best = scored.reduce((winner, entry) =>
      metric.higherIsBetter
        ? entry.value > winner.value
          ? entry
          : winner
        : entry.value < winner.value
          ? entry
          : winner,
    );
    const drawn = scored.every((entry) => entry.value === best.value);
    return drawn ? null : best.method.method;
  };

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            {methods.map((method) => (
              <th key={method.method} scope="col">
                {METHOD_LABELS[method.method] ?? method.method}
                {method.willBeUsed && <span className={styles.willUse}>Will be used</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARISON_METRICS.map((metric) => {
            const leader = leaderFor(metric);
            return (
              <tr key={metric.id}>
                <th scope="row">
                  <span className={styles.metricLabel}>{metric.label}</span>
                  <span className={styles.metricHint}>{metric.hint}</span>
                </th>
                {methods.map((method) => (
                  <td
                    key={method.method}
                    className={styles.metricValue}
                    data-leader={leader === method.method ? 'true' : undefined}
                  >
                    {metric.value(method.metrics)}
                    {leader === method.method && (
                      <span className={styles.leaderNote}>
                        better{metric.higherIsBetter ? ' (higher)' : ' (lower)'}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
