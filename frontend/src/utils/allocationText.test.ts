import {
  ALLOCATION_EXPLANATION_TYPES,
  type AllocationExplanation,
  type ScoreBreakdown,
} from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { describeOutcome, describeScore, explainResult, ordinal } from './allocationText';

const score: ScoreBreakdown = {
  preferenceRank: 1,
  preferencePoints: 100,
  bonuses: [
    { type: 'FINAL_YEAR', points: 20 },
    { type: 'PROGRAM_RELEVANCE', points: 25 },
  ],
  priorityPoints: 45,
  total: 145,
};

const facts = {
  course: { code: 'CS401', name: 'Artificial Intelligence' },
  preferenceRank: 1 as const,
  score,
  finalRank: 27,
  capacity: 20,
  applicants: 113,
  cutoffScore: 150,
};

/** One explanation of every type, so the union can be covered exhaustively. */
const EXAMPLES: Record<(typeof ALLOCATION_EXPLANATION_TYPES)[number], AllocationExplanation> = {
  ALLOCATED: { type: 'ALLOCATED', ...facts, finalRank: 4, cutoffScore: 140 },
  WAITLISTED: { type: 'WAITLISTED', waitlistPosition: 7, ...facts },
  NOT_ALLOCATED_HIGHER_CHOICE_GRANTED: {
    type: 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED',
    grantedCourse: { code: 'CS402', name: 'Cloud Security' },
    grantedRank: 1,
    ...facts,
    preferenceRank: 3,
  },
  NOT_ALLOCATED_FULL: { type: 'NOT_ALLOCATED_FULL', ...facts },
  NOT_ALLOCATED_INELIGIBLE: { type: 'NOT_ALLOCATED_INELIGIBLE', ...facts, score: null },
  PROMOTED: {
    type: 'PROMOTED',
    fromCourse: { code: 'CS403', name: 'Blockchain' },
    fromRank: 3,
    ...facts,
  },
  SEAT_WITHDRAWN: { type: 'SEAT_WITHDRAWN', ...facts },
};

describe('ordinal', () => {
  it('handles the awkward numbers', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
    ]);
  });
});

describe('describeScore', () => {
  it('shows the total as the sum it actually is', () => {
    expect(describeScore(score)).toBe(
      '145 (1st preference 100 + final year 20 + programme relevance 25)',
    );
  });

  it('shows a plain preference score with no bonuses', () => {
    expect(describeScore({ ...score, bonuses: [], priorityPoints: 0, total: 100 })).toBe(
      '100 (1st preference 100)',
    );
  });
});

describe('every explanation type', () => {
  it.each(ALLOCATION_EXPLANATION_TYPES)('has a headline and sentences: %s', (type) => {
    const explanation = EXAMPLES[type];
    expect(describeOutcome(explanation)).toBeTruthy();
    const sentences = explainResult(explanation);
    expect(sentences.length).toBeGreaterThan(0);
    expect(sentences.every((sentence) => sentence.endsWith('.'))).toBe(true);
  });

  it('puts the waitlist position in the headline', () => {
    expect(describeOutcome(EXAMPLES.WAITLISTED)).toBe('Waitlisted, #7');
  });

  it('reads like the example in the brief', () => {
    expect(explainResult(EXAMPLES.WAITLISTED)).toEqual([
      'You ranked it 1st.',
      'Your score for this course was 145 (1st preference 100 + final year 20 + programme relevance 25).',
      '20 seats went to applicants with scores of 150 or higher.',
      'You are 7th in the queue and move up automatically if a seat opens.',
    ]);
  });

  it('names the better course that was granted instead', () => {
    expect(explainResult(EXAMPLES.NOT_ALLOCATED_HIGHER_CHOICE_GRANTED).join(' ')).toContain(
      'CS402 Cloud Security',
    );
  });

  it('never says a rank that reads as a contradiction against the seats', () => {
    // 27th of 116 AND one of 20 seats is true but looks impossible: most
    // higher-scoring applicants were given a course they ranked above this.
    const sentences = explainResult(EXAMPLES.ALLOCATED).join(' ');
    expect(sentences).not.toMatch(/\d+(st|nd|rd|th) of \d+/);
    expect(sentences).toContain('113 students ranked CS401, for 20 seats.');
    expect(sentences).toContain('One of them is yours.');
  });

  it('claims no score for a method that does not score', () => {
    const fcfs: AllocationExplanation = { type: 'NOT_ALLOCATED_FULL', ...facts, score: null };
    expect(explainResult(fcfs).join(' ')).not.toContain('score for this course');
  });
});
