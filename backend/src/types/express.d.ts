/**
 * Express type augmentation: every Request may carry the authenticated caller.
 * It is set only by the `requireAuth` middleware; read it through `getAuth()`
 * or `requireStudentId()` rather than directly.
 */
import type { AuthContext } from './auth.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}
