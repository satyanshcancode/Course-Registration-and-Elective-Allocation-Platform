-- Real accounts: invitation, activation, password reset, deactivation, and the
-- course lifecycle that goes with managing a catalogue by hand.
--
-- Until now every login came from the seed. Three things change:
--
--   1. A user may exist WITHOUT a password. An administrator creates the
--      account; the student sets the password from an invitation link. So
--      password_hash becomes nullable, and "invited" is simply "no hash yet".
--   2. Password changes must end existing sessions. password_changed_at is the
--      cut-off: a session token issued before it is no longer accepted
--      (compared against the JWT's iat in services/authService.ts).
--   3. Accounts are deactivated, never deleted, so enrollments, submissions and
--      history stay intact and referentially whole.
--
-- Activation and reset links are single-use secrets, so only their SHA-256 hash
-- is stored: a leaked database row cannot be turned back into a working link.

-- ---------------------------------------------------------------------------
-- users: activation state, deactivation, and the session cut-off
-- ---------------------------------------------------------------------------

-- An invited account has no password until the student sets one.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- The bcrypt format check has to admit that NULL now, so it is replaced rather
-- than edited (CHECK constraints can't be altered in place).
ALTER TABLE users DROP CONSTRAINT users_password_hash_bcrypt_check;
ALTER TABLE users ADD CONSTRAINT users_password_hash_bcrypt_check
  CHECK (password_hash IS NULL
         OR password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$');

ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Every session token carries an `iat` (issued-at, whole seconds). A token is
-- refused when it was issued before this instant, which is how changing or
-- resetting a password signs the other devices out. Existing rows get their
-- created_at, so tokens issued before this migration stay valid.
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;
UPDATE users SET password_changed_at = created_at WHERE password_changed_at IS NULL;
ALTER TABLE users ALTER COLUMN password_changed_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_changed_at SET DEFAULT now();

-- Signing in scans by e-mail only, but the students list filters by status.
CREATE INDEX users_role_is_active_idx ON users (role, is_active);

-- ---------------------------------------------------------------------------
-- account_tokens: single-use activation and password-reset links
--
-- Only the hash of the token is stored. A link is spent when consumed_at is
-- set; resending an invitation consumes the outstanding one, so the older link
-- stops working the moment a new one is sent.
-- ---------------------------------------------------------------------------
CREATE TABLE account_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose      TEXT        NOT NULL,
  -- SHA-256 of the token, lower-case hex. The token itself is only ever in the
  -- e-mail; it is not recoverable from this row.
  token_hash   TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  -- Who sent it: an administrator for an invitation, NULL for a self-service
  -- password reset. SET NULL so removing a user never erases another's token.
  created_by   UUID        REFERENCES users (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT account_tokens_purpose_check
    CHECK (purpose IN ('ACTIVATION', 'PASSWORD_RESET')),
  CONSTRAINT account_tokens_token_hash_format_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT account_tokens_expires_after_created_check CHECK (expires_at > created_at)
);

-- "The outstanding token of this purpose for this user": the lookup that
-- resending an invitation and requesting a reset both make.
CREATE INDEX account_tokens_outstanding_idx
  ON account_tokens (user_id, purpose)
  WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- courses: deactivation instead of deletion
--
-- A course that has been offered is referenced by submissions, enrollments,
-- waitlist entries and allocation results, so it can never be deleted. It is
-- retired instead: an inactive course cannot be added to a new window.
-- ---------------------------------------------------------------------------
ALTER TABLE courses ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX courses_is_active_idx ON courses (is_active);

-- Retiring a course that a live window offers would change what students are
-- registering for. The service refuses it first (services/adminCourseService.ts);
-- this trigger is the backstop, in the same spirit as migration 0008.
CREATE FUNCTION refuse_deactivating_offered_course() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  live_window TEXT;
BEGIN
  IF OLD.is_active AND NOT NEW.is_active THEN
    SELECT w.name INTO live_window
    FROM registration_window_courses rwc
    JOIN registration_windows w ON w.id = rwc.window_id
    WHERE rwc.course_id = OLD.id AND w.status <> 'DRAFT'
    LIMIT 1;

    IF live_window IS NOT NULL THEN
      RAISE EXCEPTION
        'Course % is offered in registration window "%", which is no longer a draft',
        OLD.code, live_window
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER courses_refuse_deactivating_offered
  BEFORE UPDATE OF is_active ON courses
  FOR EACH ROW EXECUTE FUNCTION refuse_deactivating_offered_course();

-- ---------------------------------------------------------------------------
-- student_completed_courses: an unknown completion term
--
-- The seed knows which term each course was passed in. An administrator
-- recording a student's record by hand does not: the create/edit form and the
-- CSV take a list of course CODES, because "they have passed CS201" is the fact
-- the prerequisite check needs and the only one the registrar is asserting.
-- So the term becomes nullable rather than being filled with a made-up value.
-- ---------------------------------------------------------------------------
ALTER TABLE student_completed_courses ALTER COLUMN completed_term DROP NOT NULL;
