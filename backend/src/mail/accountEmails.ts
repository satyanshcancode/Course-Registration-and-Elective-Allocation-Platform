/**
 * The ONE place an account e-mail becomes words — the mail equivalent of the
 * frontend's text formatters.
 *
 * Every message is plain text, says who it is for, what the link does, how long
 * it lasts, and what to do if it was not expected. No HTML, no images, no
 * tracking: these are transactional notes that must survive any mail client,
 * and one of them is the only way a new student can get in at all.
 */
import type { EmailMessage } from './mailer.js';

export interface InvitationEmail {
  to: string;
  /** The student's name, so the message is addressed to a person. */
  name: string;
  /** Absolute URL including the token. */
  link: string;
  expiresInHours: number;
  /** True for a second or later invitation, which supersedes the first. */
  resent: boolean;
}

export interface ResetEmail {
  to: string;
  link: string;
  expiresInHours: number;
}

const SIGN_OFF = 'The Registrar\nCourse Registration and Elective Allocation Platform';

function hours(count: number): string {
  return count === 1 ? '1 hour' : `${count} hours`;
}

export function invitationEmail(details: InvitationEmail): EmailMessage {
  const opening = details.resent
    ? 'Here is a new link to set up your course registration account. Any earlier link no longer works.'
    : 'An account has been created for you on the course registration system.';

  return {
    to: details.to,
    subject: details.resent
      ? 'Your new course registration invitation'
      : 'Set up your course registration account',
    text: [
      `Hello ${details.name},`,
      '',
      opening,
      '',
      'To choose a password and sign in, open this link:',
      details.link,
      '',
      `The link works once and expires in ${hours(details.expiresInHours)}.`,
      'If it has expired, ask the registrar to send you a new invitation.',
      '',
      'Your academic record — programme, semester, credits and completed',
      'courses — is maintained by the registrar, so there is nothing else for',
      'you to fill in.',
      '',
      'If you were not expecting this, you can ignore this message; nobody can',
      'use the link without opening it.',
      '',
      SIGN_OFF,
    ].join('\n'),
  };
}

export function passwordResetEmail(details: ResetEmail): EmailMessage {
  return {
    to: details.to,
    subject: 'Reset your course registration password',
    text: [
      'Hello,',
      '',
      'Somebody asked to reset the password for the course registration',
      `account belonging to ${details.to}.`,
      '',
      'To choose a new password, open this link:',
      details.link,
      '',
      `The link works once and expires in ${hours(details.expiresInHours)}.`,
      '',
      'Setting a new password signs you out everywhere else.',
      '',
      'If you did not ask for this, you can ignore this message. Your current',
      'password still works and nothing has changed.',
      '',
      SIGN_OFF,
    ].join('\n'),
  };
}

/**
 * Sent after a password changes, to whichever address owns the account. It
 * carries no link on purpose: its only job is to make an unexpected change
 * visible to the person who did not make it.
 */
export function passwordChangedEmail(to: string): EmailMessage {
  return {
    to,
    subject: 'Your course registration password was changed',
    text: [
      'Hello,',
      '',
      `The password for the course registration account belonging to ${to} has`,
      'just been changed. You have been signed out on every other device.',
      '',
      'If this was you, there is nothing to do.',
      '',
      'If it was not, contact the registrar straight away.',
      '',
      SIGN_OFF,
    ].join('\n'),
  };
}
