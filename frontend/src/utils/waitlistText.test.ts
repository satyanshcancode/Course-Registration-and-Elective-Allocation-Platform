import {
  WAITLIST_REMOVAL_REASONS,
  WAITLIST_STATUSES,
  type PromotionSummary,
  type WaitlistStudentRef,
} from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { waitlistEntry } from '../test/registrationFixtures';
import {
  describeEnded,
  describePromotions,
  describeQueue,
  describeRemoval,
  describeUpgrade,
} from './waitlistText';

const bo: WaitlistStudentRef = {
  name: 'Bo Nair',
  email: 'bo@university.edu',
  program: 'CSE',
  semester: 5,
};

const summary = (overrides: Partial<PromotionSummary> = {}): PromotionSummary => ({
  promoted: [],
  removed: [],
  ...overrides,
});

describe('describeQueue', () => {
  it('gives the place in line and says the course is full', () => {
    expect(describeQueue(waitlistEntry())).toBe(
      'You are 3rd of 18 waiting. Every seat is taken, so you move up when one is released.',
    );
  });

  it('says when seats are free and already being offered', () => {
    expect(describeQueue(waitlistEntry({ allocated: 18 }))).toContain('2 seats are free');
  });
});

describe('describeUpgrade', () => {
  it('names the seat that would be released, so the trade is explicit', () => {
    const text = describeUpgrade({
      course: { code: 'CS402', name: 'Cloud Security' },
      rank: 2,
    });
    expect(text).toContain('your 2nd choice');
    expect(text).toContain('your CS402 seat would be released');
  });

  it('says a first seat needs nothing given up', () => {
    expect(describeUpgrade(null)).toContain('You have no seat yet');
  });
});

describe('describeEnded', () => {
  it('has words for every waitlist status', () => {
    for (const status of WAITLIST_STATUSES) {
      expect(describeEnded(waitlistEntry({ status, reason: null }))).not.toBe('');
    }
  });

  it('has words for every removal reason', () => {
    for (const reason of WAITLIST_REMOVAL_REASONS) {
      expect(describeRemoval(reason)).not.toBe('');
      expect(describeEnded(waitlistEntry({ status: 'REMOVED', reason }))).toContain(
        describeRemoval(reason),
      );
    }
  });
});

describe('describePromotions', () => {
  it('names who moved where, and where they came from', () => {
    expect(
      describePromotions(
        summary({
          promoted: [
            {
              student: bo,
              course: { code: 'CS401', name: 'Artificial Intelligence' },
              fromCourse: { code: 'CS403', name: 'Blockchain' },
            },
          ],
        }),
      ),
    ).toBe('1 student promoted: Bo Nair → CS401 (from CS403).');
  });

  it('does not invent a course they came from', () => {
    expect(
      describePromotions(
        summary({
          promoted: [{ student: bo, course: { code: 'CS401', name: 'AI' }, fromCourse: null }],
        }),
      ),
    ).toBe('1 student promoted: Bo Nair → CS401.');
  });

  it('is plain about a seat nobody could take', () => {
    expect(describePromotions(summary())).toBe('Nobody was waiting for that seat.');
    expect(
      describePromotions(
        summary({
          removed: [{ student: bo, course: { code: 'CS401', name: 'AI' }, reason: 'INELIGIBLE' }],
        }),
      ),
    ).toBe('Nobody could be promoted. 1 waitlist entry was removed.');
  });
});
