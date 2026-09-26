/**
 * The ONE place an allocation explanation becomes English.
 *
 * Every number in the sentences comes from the structured explanation the
 * server computed, so the wording can change without the arithmetic moving,
 * and the `default` branch takes a `never`: adding an explanation type to the
 * shared union breaks the build here until it has words.
 */
import type {
  AllocationExplanation,
  AllocationMetrics,
  ScoreBonus,
  ScoreBreakdown,
} from '@course-reg/shared';

/** Returns `never`, so it satisfies both a string and a string[] branch. */
function unhandledExplanation(value: never): never {
  throw new Error(`Unhandled allocation explanation: ${JSON.stringify(value)}`);
}

/** "1st", "2nd", "3rd", "4th"… for a preference rank. */
export function ordinal(value: number): string {
  const suffix =
    value % 100 >= 11 && value % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][value % 10] ?? 'th');
  return `${value}${suffix}`;
}

export function describeBonus(bonus: ScoreBonus): string {
  switch (bonus.type) {
    case 'FINAL_YEAR':
      return 'final year';
    case 'PROGRAM_RELEVANCE':
      return 'programme relevance';
    case 'GRADUATION_URGENCY':
      return 'graduating this term';
  }
}

/** "145 (1st preference 100 + final year 20 + programme relevance 25)" */
export function describeScore(score: ScoreBreakdown): string {
  const parts = [
    `${ordinal(score.preferenceRank)} preference ${score.preferencePoints}`,
    ...score.bonuses.map((bonus) => `${describeBonus(bonus)} ${bonus.points}`),
  ];
  return `${score.total} (${parts.join(' + ')})`;
}

/** The headline beside the status badge, e.g. "Waitlisted, #7". */
export function describeOutcome(explanation: AllocationExplanation): string {
  switch (explanation.type) {
    case 'ALLOCATED':
      return 'Allocated';
    case 'WAITLISTED':
      return `Waitlisted, #${explanation.waitlistPosition}`;
    case 'PROMOTED':
      return 'Promoted';
    case 'SEAT_WITHDRAWN':
      return 'Seat released';
    case 'SEAT_DROPPED':
      return 'You dropped it';
    case 'ADDED':
      return 'Added in add/drop';
    case 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED':
    case 'NOT_ALLOCATED_FULL':
    case 'NOT_ALLOCATED_INELIGIBLE':
      return 'Not allocated';
    default:
      return unhandledExplanation(explanation);
  }
}

/**
 * The full explanation, as sentences. The score sentence is added separately
 * (and only when there is a score) so FCFS, which does not score, does not
 * claim one.
 */
export function explainResult(explanation: AllocationExplanation): string[] {
  const { course, preferenceRank, score, capacity, applicants, cutoffScore } = explanation;
  const ranked = `You ranked it ${ordinal(preferenceRank)}.`;
  const scored = score ? `Your score for this course was ${describeScore(score)}.` : null;
  const cutoff =
    cutoffScore === null
      ? null
      : `${capacity} ${capacity === 1 ? 'seat' : 'seats'} went to applicants with scores of ${cutoffScore} or higher.`;
  const competition = `${applicants} students ranked ${course.code}, for ${capacity} ${capacity === 1 ? 'seat' : 'seats'}.`;

  // `finalRank` is a student's place among EVERYONE who ranked the course,
  // including the many who were given something they ranked higher and so
  // never competed for a seat here. Saying "you came 77th of 95, and one of
  // the 25 seats is yours" is true and reads as a contradiction, so the
  // student-facing sentences use the numbers that mean what they sound like:
  // how many wanted it, how many seats there were, the cut-off, and the
  // queue position.
  switch (explanation.type) {
    case 'ALLOCATED':
      return [ranked, ...(scored ? [scored] : []), competition, 'One of them is yours.'];

    case 'WAITLISTED':
      return [
        ranked,
        ...(scored ? [scored] : []),
        ...(cutoff ? [cutoff] : [`Every seat was taken.`]),
        `You are ${ordinal(explanation.waitlistPosition)} in the queue and move up automatically if a seat opens.`,
      ];

    case 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED':
      return [
        ranked,
        ...(scored ? [scored] : []),
        `You were given your ${ordinal(explanation.grantedRank)} choice, ${explanation.grantedCourse.code} ${explanation.grantedCourse.name}, which you ranked higher, so you are not waiting for this one.`,
      ];

    case 'NOT_ALLOCATED_FULL':
      return [
        ranked,
        ...(scored ? [scored] : []),
        competition,
        ...(cutoff ? [cutoff] : [`Every seat was taken.`]),
      ];

    case 'NOT_ALLOCATED_INELIGIBLE':
      return [
        ranked,
        'You no longer met this course’s requirements when allocation ran, so it could not be given to you.',
      ];

    case 'PROMOTED':
      return [
        ranked,
        ...(scored ? [scored] : []),
        'A seat opened up after allocation and you were next in line.',
        ...(explanation.fromCourse
          ? [
              `You were moved from ${explanation.fromCourse.code} ${explanation.fromCourse.name}${
                explanation.fromRank ? `, your ${ordinal(explanation.fromRank)} choice` : ''
              }, and that seat was released to the next student waiting for it.`,
            ]
          : []),
      ];

    case 'SEAT_WITHDRAWN':
      return [
        ranked,
        'You were given this seat, and an administrator has since released it.',
        'Your notifications say why. If that looks wrong, speak to the registrar.',
      ];

    case 'SEAT_DROPPED':
      return [
        ranked,
        'You were given this seat and dropped it yourself during add/drop.',
        'It went to the next student waiting for it, so it is not yours to take back.',
      ];

    case 'ADDED':
      return [
        'You took this seat yourself during add/drop, so the allocation round did not decide it.',
        'You can drop or swap it until add/drop closes.',
      ];

    default:
      return unhandledExplanation(explanation);
  }
}

/** "62%" — rates are stored as 0..1. */
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function formatAverageRank(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

/** What one metric means, for the comparison table's row labels. */
export interface MetricRow {
  id: string;
  label: string;
  hint: string;
  /** Higher is better, so the comparison can say which method leads. */
  higherIsBetter: boolean;
  value: (metrics: AllocationMetrics) => string;
  /** The comparable number, or null when the metric is not a ranking. */
  compare: (metrics: AllocationMetrics) => number | null;
}

export const COMPARISON_METRICS: readonly MetricRow[] = [
  {
    id: 'firstChoiceRate',
    label: 'Got their first choice',
    hint: 'Share of participating students allocated the course they ranked first.',
    higherIsBetter: true,
    value: (metrics) => formatRate(metrics.firstChoiceRate),
    compare: (metrics) => metrics.firstChoiceRate,
  },
  {
    id: 'topThreeRate',
    label: 'Got one of their top three',
    hint: 'Share allocated a course they ranked first, second or third.',
    higherIsBetter: true,
    value: (metrics) => formatRate(metrics.topThreeRate),
    compare: (metrics) => metrics.topThreeRate,
  },
  {
    id: 'averageAllocatedRank',
    label: 'Average rank allocated',
    hint: 'Mean position of the course each allocated student received; 1.00 is perfect.',
    higherIsBetter: false,
    value: (metrics) => formatAverageRank(metrics.averageAllocatedRank),
    compare: (metrics) => metrics.averageAllocatedRank,
  },
  {
    id: 'unallocated',
    label: 'Students with nothing',
    hint: 'Participating students who were allocated no course at all.',
    higherIsBetter: false,
    value: (metrics) => String(metrics.unallocated),
    compare: (metrics) => metrics.unallocated,
  },
  {
    id: 'seatUtilisation',
    label: 'Seats filled',
    hint: 'Share of the offered seats that ended up occupied.',
    higherIsBetter: true,
    value: (metrics) =>
      `${formatRate(metrics.seatUtilisation)} (${metrics.seatsFilled} of ${metrics.seatsOffered})`,
    compare: (metrics) => metrics.seatUtilisation,
  },
  {
    id: 'waitlistEntries',
    label: 'Waitlist entries',
    hint: 'Places in a queue, counted across every course.',
    higherIsBetter: false,
    value: (metrics) => String(metrics.waitlistEntries),
    compare: () => null,
  },
  {
    id: 'justifiedEnvy',
    label: 'Justified envy',
    hint: 'Cases where a student wanted a course that admitted someone scoring lower for it. Preference + Priority is always 0.',
    higherIsBetter: false,
    value: (metrics) => String(metrics.justifiedEnvy),
    compare: (metrics) => metrics.justifiedEnvy,
  },
  {
    id: 'runtimeMs',
    label: 'Time to compute',
    hint: 'How long the algorithm itself took.',
    higherIsBetter: false,
    value: (metrics) => `${metrics.runtimeMs} ms`,
    compare: () => null,
  },
];
