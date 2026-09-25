/**
 * The allocation run's stored explanations, brought up to date.
 *
 * `allocation_results` records what the run decided, and that row is never
 * rewritten — it is the evidence a run is reproducible. Seats move afterwards,
 * though, so what the student is TOLD has to reflect where they stand now:
 * a promotion, a seat given up to take a better one, a seat withdrawn, or a
 * queue position that has moved up.
 *
 * Pure, so the rules can be tested without a database.
 */
import type {
  AllocationExplanation,
  AllocationFacts,
  EnrollmentDropReason,
  EnrollmentSource,
  PreferenceRank,
  StudentAllocationResult,
  WaitlistRemovalReason,
  WaitlistStatus,
} from '@course-reg/shared';

/** Where the student stands right now, read from enrollments and waitlists. */
export interface LiveStanding {
  /** The seat they hold in this window, if any. */
  held: {
    code: string;
    name: string;
    rank: PreferenceRank | null;
    source: EnrollmentSource;
  } | null;
  /** Their waitlist entries by course code, as they are now. */
  entries: ReadonlyMap<
    string,
    { status: WaitlistStatus; position: number | null; reason: WaitlistRemovalReason | null }
  >;
  /**
   * Why each seat they no longer hold was released, by course code. It is the
   * difference between "an administrator took it back" and "you dropped it",
   * and only the student's own row can tell them apart.
   */
  released: ReadonlyMap<string, EnrollmentDropReason>;
}

/** The fields every explanation carries, so one type can become another. */
function factsOf(explanation: AllocationExplanation): AllocationFacts {
  const { course, preferenceRank, score, finalRank, capacity, applicants, cutoffScore } =
    explanation;
  return { course, preferenceRank, score, finalRank, capacity, applicants, cutoffScore };
}

/**
 * The sentence for the seat they hold now. The run's own ALLOCATED explanation
 * still stands; a seat that arrived later needs its own words.
 */
function heldExplanation(
  held: NonNullable<LiveStanding['held']>,
  facts: AllocationFacts,
  result: StudentAllocationResult,
  released: AllocationExplanation | undefined,
): AllocationExplanation {
  switch (held.source) {
    case 'WAITLIST_PROMOTION':
      return {
        ...facts,
        type: 'PROMOTED',
        fromCourse: released ? released.course : null,
        fromRank: released ? released.preferenceRank : null,
      };
    case 'ADD':
      return { ...facts, type: 'ADDED' };
    case 'ALLOCATION':
      return result.explanation;
  }
}

export function applyLiveStanding(
  results: readonly StudentAllocationResult[],
  live: LiveStanding,
): StudentAllocationResult[] {
  const held = live.held;
  // The seat the run gave them, when it is not the one they hold now: that is
  // the course they released to be promoted.
  const released = results.find(
    (result) =>
      result.explanation.type === 'ALLOCATED' && result.explanation.course.code !== held?.code,
  )?.explanation;

  /** "You were given X instead", when there is an X to name. */
  const higherChoiceGranted = (facts: AllocationFacts): AllocationExplanation =>
    held && held.rank !== null
      ? {
          ...facts,
          type: 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED',
          grantedCourse: { code: held.code, name: held.name },
          grantedRank: held.rank,
        }
      : { ...facts, type: 'NOT_ALLOCATED_FULL' };

  return results.map((result) => {
    const facts = factsOf(result.explanation);
    const code = facts.course.code;

    if (held?.code === code) {
      return { outcome: 'ALLOCATED', explanation: heldExplanation(held, facts, result, released) };
    }

    // The run gave them this seat and they no longer hold it.
    if (result.explanation.type === 'ALLOCATED') {
      if (held) {
        return { outcome: 'NOT_ALLOCATED', explanation: higherChoiceGranted(facts) };
      }
      return {
        outcome: 'NOT_ALLOCATED',
        explanation: {
          ...facts,
          // A drop and a withdrawal both leave the seat gone; only the reason
          // says whether the student chose it.
          type: live.released.get(code) === 'ADMIN_WITHDRAWAL' ? 'SEAT_WITHDRAWN' : 'SEAT_DROPPED',
        },
      };
    }

    const entry = live.entries.get(code);
    if (!entry) {
      // No waitlist entry, so the run ruled this course out for them. If it
      // did so by naming a better course they were given, and they have since
      // moved to a different one, the sentence has to name the new one — they
      // were never waiting here, so nothing else would have corrected it.
      if (
        result.explanation.type === 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED' &&
        held &&
        held.code !== result.explanation.grantedCourse.code
      ) {
        return { outcome: 'NOT_ALLOCATED', explanation: higherChoiceGranted(facts) };
      }
      return result;
    }
    if (entry.status === 'WAITING') {
      return {
        outcome: 'WAITLISTED',
        explanation: {
          ...facts,
          type: 'WAITLISTED',
          // A live rank among those still waiting, not the stored position.
          waitlistPosition: entry.position ?? 1,
        },
      };
    }
    if (entry.status === 'REMOVED') {
      return {
        outcome: 'NOT_ALLOCATED',
        explanation:
          entry.reason === 'INELIGIBLE'
            ? { ...facts, type: 'NOT_ALLOCATED_INELIGIBLE' }
            : higherChoiceGranted(facts),
      };
    }
    // PROMOTED, but the seat is not the one they hold: they were promoted
    // again afterwards, and that better seat is the one to point at.
    return { outcome: 'NOT_ALLOCATED', explanation: higherChoiceGranted(facts) };
  });
}
