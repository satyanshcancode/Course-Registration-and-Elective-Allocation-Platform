import type {
  AllocationExplanation,
  AllocationFacts,
  StudentAllocationResult,
} from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { applyLiveStanding, type LiveStanding } from './allocationResultsOverlay.js';

const AI = { code: 'AI401', name: 'Artificial Intelligence' };
const CS = { code: 'CS402', name: 'Cloud Security' };

function facts(course: { code: string; name: string }, rank: 1 | 2 | 3): AllocationFacts {
  return {
    course,
    preferenceRank: rank,
    score: null,
    finalRank: 1,
    capacity: 20,
    applicants: 40,
    cutoffScore: null,
  };
}

const result = (explanation: AllocationExplanation): StudentAllocationResult => ({
  outcome:
    explanation.type === 'ALLOCATED'
      ? 'ALLOCATED'
      : explanation.type === 'WAITLISTED'
        ? 'WAITLISTED'
        : 'NOT_ALLOCATED',
  explanation,
});

/** What the run decided: waiting for AI, holding CS. */
const asAllocated: StudentAllocationResult[] = [
  result({ ...facts(AI, 1), type: 'WAITLISTED', waitlistPosition: 7 }),
  result({ ...facts(CS, 2), type: 'ALLOCATED' }),
];

const nothing: LiveStanding = { held: null, entries: new Map() };

describe('applyLiveStanding', () => {
  it('leaves an untouched result exactly as the run recorded it', () => {
    const live: LiveStanding = {
      held: { ...CS, rank: 2, source: 'ALLOCATION' },
      entries: new Map([['AI401', { status: 'WAITING', position: 7, reason: null }]]),
    };

    expect(applyLiveStanding(asAllocated, live)).toEqual(asAllocated);
  });

  it('moves a waiting student up as the queue in front of them empties', () => {
    const live: LiveStanding = {
      held: { ...CS, rank: 2, source: 'ALLOCATION' },
      entries: new Map([['AI401', { status: 'WAITING', position: 2, reason: null }]]),
    };

    const [waiting] = applyLiveStanding(asAllocated, live);
    expect(waiting?.explanation).toMatchObject({ type: 'WAITLISTED', waitlistPosition: 2 });
  });

  it('says a promoted student moved, and names the seat they gave up', () => {
    const live: LiveStanding = {
      held: { ...AI, rank: 1, source: 'WAITLIST_PROMOTION' },
      entries: new Map([['AI401', { status: 'PROMOTED', position: null, reason: null }]]),
    };

    const [promoted, released] = applyLiveStanding(asAllocated, live);
    expect(promoted).toEqual({
      outcome: 'ALLOCATED',
      explanation: { ...facts(AI, 1), type: 'PROMOTED', fromCourse: CS, fromRank: 2 },
    });
    // The seat they let go is explained by the better one they were given.
    expect(released?.explanation).toMatchObject({
      type: 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED',
      grantedCourse: AI,
      grantedRank: 1,
    });
  });

  it('does not invent a released course when the student had no seat before', () => {
    const fromWaitlistOnly: StudentAllocationResult[] = [
      result({ ...facts(AI, 1), type: 'WAITLISTED', waitlistPosition: 3 }),
    ];
    const live: LiveStanding = {
      held: { ...AI, rank: 1, source: 'WAITLIST_PROMOTION' },
      entries: new Map([['AI401', { status: 'PROMOTED', position: null, reason: null }]]),
    };

    expect(applyLiveStanding(fromWaitlistOnly, live)[0]?.explanation).toMatchObject({
      type: 'PROMOTED',
      fromCourse: null,
      fromRank: null,
    });
  });

  it('says plainly when a seat was withdrawn and nothing replaced it', () => {
    const [waiting, withdrawn] = applyLiveStanding(asAllocated, {
      ...nothing,
      entries: new Map([['AI401', { status: 'WAITING', position: 7, reason: null }]]),
    });

    expect(withdrawn).toEqual({
      outcome: 'NOT_ALLOCATED',
      explanation: { ...facts(CS, 2), type: 'SEAT_WITHDRAWN' },
    });
    // They keep their place in the AI queue: losing the CS seat did not cost it.
    expect(waiting?.explanation.type).toBe('WAITLISTED');
  });

  it('explains a removed entry by the reason it was removed', () => {
    const ineligible = applyLiveStanding(asAllocated, {
      held: { ...CS, rank: 2, source: 'ALLOCATION' },
      entries: new Map([['AI401', { status: 'REMOVED', position: null, reason: 'INELIGIBLE' }]]),
    });
    expect(ineligible[0]?.explanation.type).toBe('NOT_ALLOCATED_INELIGIBLE');

    const outranked = applyLiveStanding(asAllocated, {
      held: { ...CS, rank: 2, source: 'ALLOCATION' },
      entries: new Map([
        ['AI401', { status: 'REMOVED', position: null, reason: 'RANKED_BELOW_SEAT' }],
      ]),
    });
    expect(outranked[0]?.explanation).toMatchObject({
      type: 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED',
      grantedCourse: CS,
    });
  });

  it('never claims a higher choice was granted when there is none to name', () => {
    const [waiting] = applyLiveStanding(asAllocated, {
      ...nothing,
      entries: new Map([
        ['AI401', { status: 'REMOVED', position: null, reason: 'RANKED_BELOW_SEAT' }],
      ]),
    });

    expect(waiting?.explanation.type).toBe('NOT_ALLOCATED_FULL');
  });
});
