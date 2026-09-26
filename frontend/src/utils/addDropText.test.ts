import { ADD_DROP_PROBLEM_TYPES, type AddDropProblem, type AddDropSeat } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import {
  describeHeldSeat,
  describeOutcome,
  describePassedOn,
  describePeriod,
  describeProblem,
  dropConsequence,
} from './addDropText';

const AI = { code: 'CS401', name: 'Artificial Intelligence' };
const CS = { code: 'CS402', name: 'Cloud Security' };

const seat = (overrides: Partial<AddDropSeat> = {}): AddDropSeat => ({
  course: CS,
  credits: 4,
  source: 'ALLOCATION',
  preferenceRank: 2,
  enrolledAt: '2026-09-25T10:43:03.600Z',
  ...overrides,
});

const student = { name: 'Priya', email: 'p@x', program: 'CSE', semester: 5 };

/** One problem of every type, so the union is covered exhaustively. */
const PROBLEMS: Record<(typeof ADD_DROP_PROBLEM_TYPES)[number], AddDropProblem> = {
  PERIOD_CLOSED: { type: 'PERIOD_CLOSED', reason: 'The add/drop period has closed.' },
  NOT_ALLOCATED: { type: 'NOT_ALLOCATED', reason: 'Add/drop opens once allocation has run.' },
  UNKNOWN_COURSE: { type: 'UNKNOWN_COURSE', code: 'ZZ999' },
  NOT_OFFERED: { type: 'NOT_OFFERED', code: 'CS401' },
  NOT_ELIGIBLE: {
    type: 'NOT_ELIGIBLE',
    code: 'CS401',
    eligibility: { eligible: false, reasons: [{ type: 'ALREADY_COMPLETED' }] },
  },
  SEAT_TAKEN: { type: 'SEAT_TAKEN', code: 'CS401', capacity: 20 },
  ALREADY_ENROLLED: { type: 'ALREADY_ENROLLED', code: 'CS401' },
  ALREADY_HOLDS_SEAT: { type: 'ALREADY_HOLDS_SEAT', code: 'CS401', heldCode: 'CS402' },
  NO_SEAT_HELD: { type: 'NO_SEAT_HELD' },
  NOT_THE_HELD_SEAT: { type: 'NOT_THE_HELD_SEAT', code: 'CS401', heldCode: 'CS402' },
  SAME_COURSE: { type: 'SAME_COURSE', code: 'CS402' },
  ALREADY_WAITING: { type: 'ALREADY_WAITING', code: 'CS401' },
  NOT_WAITING: { type: 'NOT_WAITING', code: 'CS401' },
  REQUEST_CHANGED: { type: 'REQUEST_CHANGED' },
};

describe('describeProblem', () => {
  it('has a sentence for every problem type', () => {
    for (const type of ADD_DROP_PROBLEM_TYPES) {
      const sentence = describeProblem(PROBLEMS[type]);
      expect(sentence.length).toBeGreaterThan(10);
      expect(sentence).toMatch(/[.!]$/);
    }
  });

  it('names the seat held when it tells a student to swap instead', () => {
    expect(describeProblem(PROBLEMS.ALREADY_HOLDS_SEAT)).toBe(
      'You hold a seat in CS402, so swap it for CS401 rather than adding.',
    );
  });

  it('states a lost race plainly, with no apology or jargon', () => {
    expect(describeProblem(PROBLEMS.SEAT_TAKEN)).toBe('That seat was just taken.');
  });

  it('passes the server’s own reason through for the period', () => {
    expect(describeProblem(PROBLEMS.PERIOD_CLOSED)).toBe('The add/drop period has closed.');
  });
});

describe('describeOutcome', () => {
  it('says where a dropped seat went', () => {
    expect(
      describeOutcome({
        outcome: 'DROPPED',
        course: CS,
        dropReason: 'STUDENT_DROP',
        promotions: { promoted: [{ student, course: CS, fromCourse: null }], removed: [] },
        leftWaitlists: [],
      }),
    ).toBe('You dropped CS402. The seat went straight to the next student waiting for it.');
  });

  it('admits when nobody was waiting, rather than implying somebody was', () => {
    expect(
      describeOutcome({
        outcome: 'DROPPED',
        course: CS,
        dropReason: 'STUDENT_DROP',
        promotions: { promoted: [], removed: [] },
        leftWaitlists: [AI],
      }),
    ).toContain('Nobody was waiting for the seat');
  });

  it('counts the waitlists left in the same action', () => {
    const message = describeOutcome({
      outcome: 'DROPPED',
      course: CS,
      dropReason: 'STUDENT_DROP',
      promotions: { promoted: [], removed: [] },
      leftWaitlists: [AI],
    });
    expect(message).toContain('You also left 1 waitlist.');
  });

  it('distinguishes a queue joined because a course was full', () => {
    const full = describeOutcome({
      outcome: 'WAITLISTED',
      course: AI,
      position: 4,
      waiting: 12,
      courseWasFull: true,
    });
    const chosen = describeOutcome({
      outcome: 'WAITLISTED',
      course: AI,
      position: 4,
      waiting: 12,
      courseWasFull: false,
    });
    expect(full).toContain('CS401 was full, so you joined its waitlist at 4th of 12.');
    expect(chosen).toContain('You joined the waitlist for CS401 at 4th of 12.');
  });

  it('names both courses in a swap', () => {
    expect(
      describeOutcome({
        outcome: 'SWAPPED',
        from: CS,
        to: AI,
        promotions: { promoted: [], removed: [] },
      }),
    ).toContain('You now hold CS401 instead of CS402.');
  });

  it('warns that leaving a queue is not undone by itself', () => {
    expect(describeOutcome({ outcome: 'WAITLIST_LEFT', course: AI })).toContain(
      'unless you rejoin',
    );
  });
});

describe('describePassedOn', () => {
  it('counts a cascade of more than one', () => {
    expect(
      describePassedOn({
        promoted: [
          { student, course: AI, fromCourse: CS },
          { student, course: CS, fromCourse: null },
        ],
        removed: [],
      }),
    ).toBe('2 students moved up as a result.');
  });
});

describe('describeHeldSeat', () => {
  it('says how the seat was come by, and drops the rank when there is none', () => {
    expect(describeHeldSeat(seat())).toBe(
      'Allocated to you in the registration round — your 2nd choice.',
    );
    expect(describeHeldSeat(seat({ source: 'WAITLIST_PROMOTION', preferenceRank: 1 }))).toBe(
      'A seat freed up and you were next in line — your 1st choice.',
    );
    // A course taken in add/drop was never ranked, so there is no rank to name.
    expect(describeHeldSeat(seat({ source: 'ADD', preferenceRank: null }))).toBe(
      'You took this seat during add/drop.',
    );
    expect(describeHeldSeat(seat({ preferenceRank: null }))).toBe(
      'Allocated to you in the registration round.',
    );
  });
});

describe('describePeriod', () => {
  const period = {
    opensAt: '2026-10-18T04:30:00.000Z',
    closesAt: '2026-10-25T11:30:00.000Z',
  };

  it('gives the range when it is not open, and the deadline when it is', () => {
    expect(describePeriod({ ...period, open: false, closedReason: 'Not yet.' })).toContain(' to ');
    expect(describePeriod({ ...period, open: true, closedReason: null })).toContain('open until');
  });

  it('says so when nothing has been scheduled', () => {
    expect(
      describePeriod({ opensAt: null, closesAt: null, open: false, closedReason: 'No period.' }),
    ).toBe('No add/drop period has been scheduled yet.');
  });
});

describe('dropConsequence', () => {
  it('states the consequence plainly, and that it cannot be taken back', () => {
    const message = dropConsequence(seat(), 0);
    expect(message).toContain('goes to the next student on the waitlist');
    expect(message).toContain('won’t get it back unless another seat opens');
  });

  it('mentions the queues the student stays on', () => {
    expect(dropConsequence(seat(), 2)).toContain('You are on 2 other waitlists');
    expect(dropConsequence(seat(), 1)).toContain('stay on it unless you choose to leave');
  });
});
