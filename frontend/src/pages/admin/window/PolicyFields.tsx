import { PREFERENCE_RANKS, POLICY_POINT_LIMITS, type AllocationConfig } from '@course-reg/shared';
import { Dice5 } from 'lucide-react';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { Input } from '../../../components/Input';
import { firstIncreasingRank, withPriorityPoint, withWeight } from '../../../utils/windowForm';
import styles from './PolicyFields.module.css';

export interface PolicyFieldsProps {
  policy: AllocationConfig;
  randomSeed: number;
  error?: string;
  seedError?: string;
  onPolicyChange: (policy: AllocationConfig) => void;
  onSeedChange: (seed: number) => void;
  onGenerateSeed: () => void;
}

const PRIORITY_LABELS = {
  finalYear: 'Final year (semester 7 or 8)',
  programRelevance: 'Course is core to the programme',
  graduationUrgency: 'Graduating on or before this term',
} as const;

/**
 * Whole points only. An emptied box reads as 0 so it can be cleared and
 * retyped; anything else unparseable keeps the last good number.
 */
function readPoints(value: string, fallback: number): number {
  if (value.trim() === '') {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * The settings that belong to the chosen allocation method.
 *
 * `policy` is the shared AllocationConfig union, so narrowing on `method` is
 * what decides which fields exist — TypeScript then knows `preferenceWeights`
 * is there in one branch and absent in the other, with no casts.
 */
export function PolicyFields({
  policy,
  randomSeed,
  error,
  seedError,
  onPolicyChange,
  onSeedChange,
  onGenerateSeed,
}: PolicyFieldsProps) {
  if (policy.method === 'FCFS') {
    return (
      <div className={styles.explainer}>
        <p>
          Seats go to whoever submits first, ordered by the server’s own submission sequence — never
          by a clock the student controls.
        </p>
        <p className={styles.caution}>
          First-come-first-served rewards a fast connection rather than need or merit, which is the
          problem this platform exists to fix. It is kept as a baseline to compare against.
        </p>
      </div>
    );
  }

  const risingRank = firstIncreasingRank(policy);

  return (
    <div className={styles.settings}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Preference weights</legend>
        <p className={styles.hint}>
          Points for ranking a course at each position. A lower choice must never be worth more than
          a higher one.
        </p>
        <div className={styles.weights}>
          {PREFERENCE_RANKS.map((rank) => (
            <FormField key={rank} label={`P${rank}`}>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  inputMode="numeric"
                  min={POLICY_POINT_LIMITS.min}
                  max={POLICY_POINT_LIMITS.max}
                  step={1}
                  required
                  aria-invalid={risingRank === rank ? true : undefined}
                  value={policy.preferenceWeights[rank]}
                  onChange={(event) => {
                    onPolicyChange(
                      withWeight(
                        policy,
                        rank,
                        readPoints(event.target.value, policy.preferenceWeights[rank]),
                      ),
                    );
                  }}
                />
              )}
            </FormField>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Priority points</legend>
        <p className={styles.hint}>
          Added to the preference weight. Every input is derived from the student’s record, never
          stored as a flag.
        </p>
        <div className={styles.priorities}>
          {(Object.keys(PRIORITY_LABELS) as (keyof typeof PRIORITY_LABELS)[]).map((key) => (
            <FormField key={key} label={PRIORITY_LABELS[key]}>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  inputMode="numeric"
                  min={POLICY_POINT_LIMITS.min}
                  max={POLICY_POINT_LIMITS.max}
                  step={1}
                  required
                  value={policy.priorityPoints[key]}
                  onChange={(event) => {
                    onPolicyChange(
                      withPriorityPoint(
                        policy,
                        key,
                        readPoints(event.target.value, policy.priorityPoints[key]),
                      ),
                    );
                  }}
                />
              )}
            </FormField>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.seed}>
        <FormField
          label="Tie-break seed"
          hint="Stored with the allocation run, so an identical run can be reproduced."
          error={seedError}
        >
          {(field) => (
            <Input
              {...field}
              type="number"
              inputMode="numeric"
              min={0}
              max={4294967295}
              step={1}
              required
              value={randomSeed}
              onChange={(event) => {
                onSeedChange(readPoints(event.target.value, randomSeed));
              }}
            />
          )}
        </FormField>
        <Button type="button" variant="secondary" iconStart={Dice5} onClick={onGenerateSeed}>
          Generate new seed
        </Button>
      </div>
    </div>
  );
}
