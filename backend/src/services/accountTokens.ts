/**
 * Activation and password-reset links: how the secret is made, how it is stored,
 * and when a session token becomes stale.
 *
 * Pure and dependency-free (apart from node:crypto), so every rule here is unit
 * tested without a database.
 *
 * The shape of the scheme:
 *   * the token is 32 bytes from the CSPRNG, base64url — 256 bits, so guessing
 *     is not a threat and no rate limit has to carry that weight;
 *   * only its SHA-256 hash reaches the database, so a stolen table of rows
 *     cannot be turned back into working links;
 *   * SHA-256 is right here where bcrypt would be wrong: the input is already
 *     high-entropy, so there is nothing to slow an attacker down about, and the
 *     lookup has to be a single indexed query;
 *   * the hash is looked up, never compared in application code, so there is no
 *     timing comparison to get wrong.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 bits: the same order as a session token's signature. */
const TOKEN_BYTES = 32;

/** A fresh link secret. Returned once, to be e-mailed and then forgotten. */
export function generateAccountToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Lower-case hex SHA-256, the form `account_tokens.token_hash` stores. */
export function hashAccountToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time hash comparison, for the one place two hashes are compared in
 * JavaScript rather than by an indexed lookup.
 */
export function accountTokenHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which is itself not secret:
  // both sides are fixed-width hex.
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Only a token that looks like one is worth a database round trip. */
export function looksLikeAccountToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

export function accountTokenExpiry(now: Date, ttlHours: number): Date {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

/**
 * The session cut-off in whole seconds: a token is accepted only if its `iat` is
 * at least this.
 *
 * Rounded UP, because a JWT's `iat` is whole seconds rounded DOWN. A password
 * change at 12:00:00.400 must invalidate a token issued at 12:00:00.100, whose
 * `iat` is 12:00:00 — comparing against the truncated change time would call
 * that token newer than the change and let it through for the rest of the
 * second. Rounding the cut-off up to 12:00:01 closes that window exactly.
 */
export function sessionCutoffSeconds(passwordChangedAt: Date): number {
  return Math.ceil(passwordChangedAt.getTime() / 1000);
}

/**
 * Whether a session token predates the account's last password change, and so
 * must be refused.
 */
export function sessionPredatesPasswordChange(
  issuedAtSeconds: number,
  passwordChangedAt: Date,
): boolean {
  return issuedAtSeconds < sessionCutoffSeconds(passwordChangedAt);
}

/**
 * The `iat` to sign a NEW session with: now, or the cut-off if that is later.
 *
 * This is the other half of rounding the cut-off up. Without it, a session
 * created in the same second as the password change — the one activation, a
 * reset and a change each hand back, and any sign-in in that second — would
 * carry an `iat` below the cut-off and be refused on its very first request.
 *
 * Pushing `iat` to the cut-off makes the rule exact in both directions: every
 * session issued before the change is refused, and every session issued after
 * it is accepted, with no window either way. `exp` stays relative to `iat`, so
 * such a session lasts its full eight hours.
 */
export function sessionIssuedAtSeconds(now: Date, passwordChangedAt: Date): number {
  return Math.max(Math.floor(now.getTime() / 1000), sessionCutoffSeconds(passwordChangedAt));
}
