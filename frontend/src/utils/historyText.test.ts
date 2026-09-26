import {
  HISTORY_EVENT_TYPES,
  type HistoryEvent,
  type HistoryEventDetail,
} from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { historyEvent } from '../test/activityFixtures';
import {
  describeHistoryEvent,
  groupByDay,
  historyEventIcon,
  historyEventLabel,
  localDay,
} from './historyText';

/** One example of every event type, so the formatter can be swept. */
const EVERY_DETAIL: HistoryEventDetail[] = [
  { type: 'DRAFT_SAVED', courseCodes: ['CS401', 'CS402'] },
  { type: 'SUBMITTED', reference: 'REF-3F9A2C71', courseCodes: ['CS401', 'CS402'] },
  { type: 'ALLOCATED', rank: 1, finalRank: 4, waitlisted: [] },
  { type: 'WAITLISTED', waitlisted: [{ rank: 1, position: 3 }] },
  { type: 'NOT_ALLOCATED' },
  { type: 'PROMOTED', rank: 1, fromPosition: 2, releasedCourse: 'CS402' },
  { type: 'ADDED', source: 'ADD', seatFreedBeforeJoining: false, endedQueues: [] },
  {
    type: 'DROPPED',
    reason: 'STUDENT_DROP',
    upgradedTo: null,
    note: null,
    leftWaitlists: [],
  },
  { type: 'SWAPPED', from: 'CS402', to: 'CS401', endedQueues: [] },
  { type: 'WAITLIST_JOINED', position: 4, courseWasFull: true },
  { type: 'WAITLIST_LEFT', reason: 'STUDENT_LEFT', position: 2 },
  { type: 'WAITLIST_REMOVED', reason: 'RANKED_BELOW_SEAT' },
];

const say = (detail: HistoryEventDetail, overrides: Partial<HistoryEvent> = {}) =>
  describeHistoryEvent(historyEvent(detail, overrides));

describe('describeHistoryEvent', () => {
  it('has a sentence for every event type the API can send', () => {
    // The union and the tuple are held together in `shared`; this proves the
    // formatter keeps up with both.
    expect(EVERY_DETAIL.map((detail) => detail.type).sort()).toEqual(
      [...HISTORY_EVENT_TYPES].sort(),
    );

    for (const detail of EVERY_DETAIL) {
      const sentence = say(detail);
      expect(sentence.length).toBeGreaterThan(10);
      expect(sentence).toMatch(/\.$/);
    }
  });

  it('names the course, the choice and the place in line for an allocation', () => {
    expect(say({ type: 'ALLOCATED', rank: 2, finalRank: 7, waitlisted: [] })).toBe(
      'Allocation gave you a seat in CS401 Artificial Intelligence, your 2nd choice, 7th in line for it.',
    );
  });

  it('names what was submitted, and still reads when the list is missing', () => {
    expect(
      say({ type: 'SUBMITTED', reference: 'REF-3F9A2C71', courseCodes: ['CS401', 'CS402'] }),
    ).toBe('You submitted 2 preferences — CS401 and CS402 (REF-3F9A2C71).');
    expect(say({ type: 'SUBMITTED', reference: null, courseCodes: [] })).toBe(
      'You submitted your preferences.',
    );
  });

  it('mentions the waitlists an allocation also put the student on', () => {
    expect(
      say({
        type: 'ALLOCATED',
        rank: 2,
        finalRank: 7,
        waitlisted: [{ rank: 1, position: 3 }],
      }),
    ).toContain('You were also put on 1 waitlist (3rd in line).');
  });

  it('writes a promotion as a move between two named courses', () => {
    expect(say({ type: 'PROMOTED', rank: 1, fromPosition: 2, releasedCourse: 'CS402' })).toBe(
      'You were moved up from CS402 to CS401 Artificial Intelligence, your 1st choice, when a seat opened. You were 2nd in line.',
    );
  });

  it('tells the four reasons a seat was released apart', () => {
    expect(
      say({
        type: 'DROPPED',
        reason: 'ADMIN_WITHDRAWAL',
        upgradedTo: null,
        note: 'Left the programme',
        leftWaitlists: [],
      }),
    ).toBe(
      'An administrator withdrew you from CS401 Artificial Intelligence. Reason: Left the programme',
    );
    expect(
      say({
        type: 'DROPPED',
        reason: 'UPGRADED',
        upgradedTo: 'CS400',
        note: null,
        leftWaitlists: [],
      }),
    ).toContain('released to take CS400');
    expect(
      say({
        type: 'DROPPED',
        reason: 'SWAPPED',
        upgradedTo: null,
        note: null,
        leftWaitlists: [],
      }),
    ).toContain('as part of a swap');
    expect(
      say({
        type: 'DROPPED',
        reason: 'STUDENT_DROP',
        upgradedTo: null,
        note: null,
        leftWaitlists: ['CS402', 'CS403'],
      }),
    ).toContain('You also left the waitlist for CS402 and CS403.');
  });

  it('explains a seat that freed up while the student was queueing for it', () => {
    expect(
      say({ type: 'ADDED', source: 'ADD', seatFreedBeforeJoining: true, endedQueues: [] }),
    ).toContain('freed up while you were asking to join its waitlist');
  });

  it('says which queues an add or a swap ended', () => {
    expect(
      say({ type: 'ADDED', source: 'ADD', seatFreedBeforeJoining: false, endedQueues: ['CS402'] }),
    ).toContain('That ended your place in the queue for CS402.');
    expect(
      say({ type: 'SWAPPED', from: 'CS402', to: 'CS401', endedQueues: ['CS403', 'CS404'] }),
    ).toContain('the queues for CS403 and CS404');
  });

  it('borrows the waitlist page’s wording for a removal, so the two agree', () => {
    expect(say({ type: 'WAITLIST_REMOVED', reason: 'RANKED_BELOW_SEAT' })).toContain(
      'you were given a course you ranked higher',
    );
  });

  // A course removed from the catalogue leaves `course: null` on its rows.
  it('still reads when the course it was about is gone', () => {
    for (const detail of EVERY_DETAIL) {
      expect(say(detail, { course: null })).not.toContain('undefined');
    }
    expect(
      say({ type: 'WAITLIST_JOINED', position: 1, courseWasFull: true }, { course: null }),
    ).toBe('a course no longer listed was full, so you joined its waitlist, 1st in line.');
  });

  it('leaves out a rank or a position that was never recorded', () => {
    expect(say({ type: 'PROMOTED', rank: null, fromPosition: null, releasedCourse: null })).toBe(
      'You were moved up to CS401 Artificial Intelligence when a seat opened.',
    );
  });
});

describe('historyEventLabel and historyEventIcon', () => {
  it('cover every event type', () => {
    for (const type of HISTORY_EVENT_TYPES) {
      expect(historyEventLabel(type)).not.toBe('');
      expect(historyEventIcon(type)).toBeTypeOf('object');
    }
  });

  it('give each type its own label', () => {
    const labels = HISTORY_EVENT_TYPES.map(historyEventLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('groupByDay', () => {
  it('keeps consecutive events of one day together, in order', () => {
    const events = [
      historyEvent({ type: 'NOT_ALLOCATED' }, { at: '2026-09-21T14:00:00.000Z' }),
      historyEvent({ type: 'NOT_ALLOCATED' }, { at: '2026-09-21T09:00:00.000Z' }),
      historyEvent({ type: 'NOT_ALLOCATED' }, { at: '2026-09-19T09:00:00.000Z' }),
    ];

    const days = groupByDay(events);

    expect(days).toHaveLength(2);
    expect(days[0]?.events).toHaveLength(2);
    expect(days[1]?.events).toHaveLength(1);
    expect(days[0]?.day).toBe(localDay('2026-09-21T14:00:00.000Z'));
  });

  it('returns nothing for an empty timeline', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
