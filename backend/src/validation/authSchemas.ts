import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z
    .string({ error: 'E-mail is required.' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid e-mail address.' }).max(254)),
  // Length cap: bcrypt only uses 72 bytes, and huge inputs are a DoS vector.
  password: z
    .string({ error: 'Password is required.' })
    .min(1, 'Password is required.')
    .max(128, 'Password is too long.'),
});
