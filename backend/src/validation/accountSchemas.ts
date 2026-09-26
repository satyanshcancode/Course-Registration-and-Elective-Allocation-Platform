import { assessPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@course-reg/shared';
import { z } from 'zod';

/**
 * The server's password rule, expressed with the SAME shared function the
 * strength hint uses, so the hint can never say "acceptable" about something
 * this rejects.
 */
const newPassword = z
  .string({ error: 'Choose a password.' })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, 'That password is too long.')
  .refine((value) => assessPassword(value).acceptable, {
    error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  });

/** Bounded before it is hashed: the hash lookup should not be handed a novel. */
const accountToken = z
  .string({ error: 'The link is missing its token.' })
  .trim()
  .min(1, 'The link is missing its token.')
  .max(128, 'That is not a valid link.');

export const emailSchema = z
  .string({ error: 'E-mail is required.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid e-mail address.' }).max(254));

export const setPasswordSchema = z.object({
  token: accountToken,
  password: newPassword,
});

export const activationTokenSchema = accountToken;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: 'Enter your current password.' })
      .min(1, 'Enter your current password.')
      .max(PASSWORD_MAX_LENGTH, 'That password is too long.'),
    newPassword,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    error: 'The new password must be different from the current one.',
    path: ['newPassword'],
  });
