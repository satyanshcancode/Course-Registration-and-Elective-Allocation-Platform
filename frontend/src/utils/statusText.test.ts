import type { StudentStatus } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { studentStatus } from '../test/activityFixtures';
import { describeSeatOrigin, describeStanding } from './statusText';

const status = (overrides: Partial<StudentStatus>): StudentStatus => ({
  ...studentStatus,
  ...overrides,
});

describe('describeSeatOrigin', () => {
  it('names each of the four ways a seat is obtained', () => {
    const seat = studentStatus.held;
    if (!seat) {
      throw new Error('the fixture holds a seat');
    }
    expect(describeSeatOrigin(seat)).toBe('Given by allocation, your 1st choice');
    expect(describeSeatOrigin({ ...seat, origin: 'PROMOTION', preferenceRank: 2 })).toBe(
      'Moved up from a waitlist, your 2nd choice',
    );
    expect(describeSeatOrigin({ ...seat, origin: 'ADD', preferenceRank: null })).toBe(
      'Added during add/drop',
    );
    expect(describeSeatOrigin({ ...seat, origin: 'SWAP', preferenceRank: null })).toBe(
      'Swapped into during add/drop',
    );
  });
});

describe('describeStanding', () => {
  it('leads with the seat held, whatever stage the window is at', () => {
    expect(describeStanding(studentStatus)).toBe(
      'You hold a seat in CS401 Artificial Intelligence.',
    );
  });

  it('counts the queues the student is still on', () => {
    expect(
      describeStanding(
        status({
          waiting: [
            {
              course: { code: 'CS402', name: 'Cloud Security' },
              preferenceRank: 1,
              status: 'WAITING',
              position: 2,
              waiting: 9,
              capacity: 30,
              allocated: 30,
              score: 120,
              reason: null,
              endedAt: null,
            },
          ],
        }),
      ),
    ).toContain('You are waiting for 1 course.');
  });

  it('describes each window stage for a student with no seat', () => {
    const sentences = (['DRAFT', 'OPEN', 'CLOSED', 'ALLOCATED'] as const).map((stage) =>
      describeStanding(
        status({
          held: null,
          window: studentStatus.window && { ...studentStatus.window, status: stage },
        }),
      ),
    );
    expect(new Set(sentences).size).toBe(4);
    expect(sentences[1]).toContain('Allocation runs once registration closes');
    expect(sentences[3]).toBe('Allocation has run and you do not hold a seat.');
  });

  it('separates "submitted" from "did not submit" while registration is open', () => {
    const open = studentStatus.window && { ...studentStatus.window, status: 'OPEN' as const };
    expect(describeStanding(status({ held: null, window: open, submission: null }))).toContain(
      'you have not submitted yet',
    );
  });

  it('says there is nothing to report before a window exists', () => {
    expect(describeStanding(status({ window: null, held: null }))).toContain(
      'No registration window has been scheduled yet',
    );
  });
});
