import { TEAM_MEMBER_STATUSES, USER_ROLES } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { roleLabel, roleSummary, teamStatusDetail, teamStatusLabel } from './roleText';

describe('roleLabel', () => {
  it('names each role the way the interface says it', () => {
    expect(roleLabel('STUDENT')).toBe('Student');
    expect(roleLabel('ADMIN')).toBe('Administrator');
    expect(roleLabel('CO_ADMIN')).toBe('Co-administrator');
  });

  it('has wording for every role there is', () => {
    for (const role of USER_ROLES) {
      expect(roleLabel(role)).not.toBe('');
      expect(roleSummary(role)).not.toBe('');
    }
  });
});

describe('roleSummary', () => {
  it('says what separates the two staff roles', () => {
    expect(roleSummary('ADMIN')).toMatch(/including these staff accounts/);
    expect(roleSummary('CO_ADMIN')).toMatch(/except managing staff accounts/);
  });
});

describe('team status wording', () => {
  it('has a label and an explanation for every status', () => {
    for (const status of TEAM_MEMBER_STATUSES) {
      expect(teamStatusLabel(status)).not.toBe('');
      expect(teamStatusDetail(status)).not.toBe('');
    }
  });

  it('explains what being deactivated means for the record', () => {
    expect(teamStatusDetail('DEACTIVATED')).toMatch(/history is kept/i);
  });
});
