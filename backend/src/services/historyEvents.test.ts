import { HISTORY_EVENT_TYPES, type HistoryEventType } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { toHistoryDetail } from './historyEvents.js';

/**
 * The `details` each service actually writes, copied from the call sites so
 * that a change there shows up here rather than as a blank line on a timeline.
 */
const WRITTEN: Record<HistoryEventType, unknown> = {
  DRAFT_SAVED: { courseCodes: ['CS401', 'CS402'] },
  SUBMITTED: { reference: 'REF-3F9A2C71', courseCodes: ['CS401', 'CS402', 'CS403'] },
  ALLOCATED: {
    allocated: { rank: 2, finalRank: 7 },
    waitlisted: [{ rank: 1, position: 3 }],
  },
  WAITLISTED: {
    allocated: null,
    waitlisted: [
      { rank: 1, position: 3 },
      { rank: 4, position: 11 },
    ],
  },
  NOT_ALLOCATED: { allocated: null, waitlisted: [] },
  PROMOTED: { rank: 1, fromPosition: 2, releasedCourse: 'CS402' },
  ADDED: { source: 'ADD', endedQueues: ['CS403'] },
  DROPPED: { reason: 'STUDENT_DROP', leftWaitlists: ['CS403'] },
  SWAPPED: { from: 'CS401', to: 'CS402', endedQueues: [] },
  WAITLIST_JOINED: { position: 4, courseWasFull: true },
  WAITLIST_LEFT: { reason: 'STUDENT_LEFT', position: 2 },
  WAITLIST_REMOVED: { reason: 'RANKED_BELOW_SEAT' },
};

describe('toHistoryDetail', () => {
  it('reads what each service writes, for every event type', () => {
    for (const type of HISTORY_EVENT_TYPES) {
      expect(toHistoryDetail(type, WRITTEN[type]).type).toBe(type);
    }
  });

  it('keeps the facts a submission carries', () => {
    expect(toHistoryDetail('SUBMITTED', WRITTEN.SUBMITTED)).toEqual({
      type: 'SUBMITTED',
      reference: 'REF-3F9A2C71',
      courseCodes: ['CS401', 'CS402', 'CS403'],
    });
  });

  it('unwraps the nested `allocated` object an allocation run writes', () => {
    expect(toHistoryDetail('ALLOCATED', WRITTEN.ALLOCATED)).toEqual({
      type: 'ALLOCATED',
      rank: 2,
      finalRank: 7,
      waitlisted: [{ rank: 1, position: 3 }],
    });
  });

  it('carries every queue an allocation waitlisted the student for', () => {
    expect(toHistoryDetail('WAITLISTED', WRITTEN.WAITLISTED)).toEqual({
      type: 'WAITLISTED',
      waitlisted: [
        { rank: 1, position: 3 },
        { rank: 4, position: 11 },
      ],
    });
  });

  it('distinguishes the three reasons a seat is released', () => {
    expect(toHistoryDetail('DROPPED', { reason: 'UPGRADED', upgradedTo: 'CS401' })).toMatchObject({
      reason: 'UPGRADED',
      upgradedTo: 'CS401',
    });
    expect(
      toHistoryDetail('DROPPED', { reason: 'ADMIN_WITHDRAWAL', note: 'Timetable clash' }),
    ).toMatchObject({ reason: 'ADMIN_WITHDRAWAL', note: 'Timetable clash' });
    expect(toHistoryDetail('DROPPED', WRITTEN.DROPPED)).toMatchObject({
      reason: 'STUDENT_DROP',
      leftWaitlists: ['CS403'],
    });
  });

  it('reports the seat that freed up between asking and joining', () => {
    expect(
      toHistoryDetail('ADDED', { source: 'ADD', seatFreedBeforeJoining: true, endedQueues: [] }),
    ).toMatchObject({ seatFreedBeforeJoining: true });
    expect(toHistoryDetail('ADDED', WRITTEN.ADDED)).toMatchObject({
      seatFreedBeforeJoining: false,
    });
  });

  // Rows written by earlier phases, or by a service that has moved on, must
  // still render: "not known" is a far better timeline than a crash.
  describe('rows whose details are missing or malformed', () => {
    it('never throws, whatever the JSON holds', () => {
      for (const type of HISTORY_EVENT_TYPES) {
        for (const details of [{}, null, [], 'nonsense', 42, { rank: 'first', position: 1.5 }]) {
          expect(toHistoryDetail(type, details).type).toBe(type);
        }
      }
    });

    it('reads an absent value as null rather than inventing one', () => {
      expect(toHistoryDetail('PROMOTED', {})).toEqual({
        type: 'PROMOTED',
        rank: null,
        fromPosition: null,
        releasedCourse: null,
      });
    });

    it('rejects a rank outside 1–5 and a non-integer position', () => {
      expect(toHistoryDetail('PROMOTED', { rank: 9, fromPosition: 2.5 })).toMatchObject({
        rank: null,
        fromPosition: null,
      });
    });

    it('falls back to the reason the event itself implies', () => {
      expect(toHistoryDetail('DROPPED', {})).toMatchObject({ reason: 'STUDENT_DROP' });
      expect(toHistoryDetail('WAITLIST_LEFT', {})).toMatchObject({ reason: 'STUDENT_LEFT' });
      expect(toHistoryDetail('WAITLIST_REMOVED', {})).toMatchObject({ reason: 'SEAT_ELSEWHERE' });
    });

    it('drops non-string entries from a list of course codes', () => {
      expect(
        toHistoryDetail('SUBMITTED', { courseCodes: ['CS401', 7, null, 'CS402'] }),
      ).toMatchObject({ courseCodes: ['CS401', 'CS402'] });
    });
  });
});
