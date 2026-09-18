-- Users, departments, programs, students, courses and course rules.
--
-- Conventions used by every migration:
--   * Status/role/method columns are TEXT + named CHECK constraints rather than
--     PostgreSQL enum types: adding a value is a plain ALTER of the constraint and
--     works inside a transaction.
--   * Constraints are named explicitly so the application can map violations to
--     user-facing messages.
--   * Academic terms are 'YYYY-SPRING' or 'YYYY-FALL'.

-- Case-insensitive text, so 'A@x.edu' and 'a@x.edu' are the same e-mail.
CREATE EXTENSION IF NOT EXISTS citext;

-- Keeps updated_at current on every UPDATE (attached per table below).
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- users: every login (students and administrators)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT      NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email),
  -- Lets students reference (id, role) so only STUDENT users get a profile.
  CONSTRAINT users_id_role_key UNIQUE (id, role),
  CONSTRAINT users_email_format_check CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT users_role_check CHECK (role IN ('STUDENT', 'ADMIN')),
  -- Only bcrypt hashes may be stored, never plain-text passwords.
  CONSTRAINT users_password_hash_bcrypt_check
    CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$')
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- departments and programs
-- ---------------------------------------------------------------------------
CREATE TABLE departments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departments_code_key UNIQUE (code),
  CONSTRAINT departments_name_key UNIQUE (name),
  CONSTRAINT departments_code_format_check CHECK (code ~ '^[A-Z]{2,10}$'),
  CONSTRAINT departments_name_not_blank_check CHECK (btrim(name) <> '')
);

CREATE TABLE programs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  department_id UUID        NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT programs_code_key UNIQUE (code),
  CONSTRAINT programs_name_key UNIQUE (name),
  CONSTRAINT programs_code_format_check CHECK (code ~ '^[A-Z][A-Z0-9-]{1,19}$'),
  CONSTRAINT programs_name_not_blank_check CHECK (btrim(name) <> '')
);

CREATE INDEX programs_department_id_idx ON programs (department_id);

-- ---------------------------------------------------------------------------
-- students: 1:1 profile for users with role STUDENT
--
-- Mock priority inputs are derived from facts rather than stored as flags:
--   final year          -> semester >= 7
--   program relevance   -> course_program_relevance
--   graduation urgency  -> expected_graduation_term <= the window's term
-- ---------------------------------------------------------------------------
CREATE TABLE students (
  user_id                  UUID        PRIMARY KEY,
  -- Always 'STUDENT'; paired with user_id in the FK so an ADMIN can never
  -- have a student profile (and a user with a profile cannot become ADMIN).
  user_role                TEXT        NOT NULL DEFAULT 'STUDENT',
  roll_number              TEXT        NOT NULL,
  name                     TEXT        NOT NULL,
  program_id               UUID        NOT NULL REFERENCES programs (id) ON DELETE RESTRICT,
  semester                 SMALLINT    NOT NULL,
  credits_completed        INTEGER     NOT NULL DEFAULT 0,
  expected_graduation_term TEXT        NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT students_user_fkey FOREIGN KEY (user_id, user_role)
    REFERENCES users (id, role) ON DELETE CASCADE,
  CONSTRAINT students_user_role_check CHECK (user_role = 'STUDENT'),
  CONSTRAINT students_roll_number_key UNIQUE (roll_number),
  CONSTRAINT students_roll_number_format_check CHECK (roll_number ~ '^[A-Z0-9]{4,20}$'),
  CONSTRAINT students_name_not_blank_check CHECK (btrim(name) <> ''),
  CONSTRAINT students_semester_check CHECK (semester BETWEEN 1 AND 8),
  CONSTRAINT students_credits_completed_check CHECK (credits_completed >= 0),
  CONSTRAINT students_expected_graduation_term_format_check
    CHECK (expected_graduation_term ~ '^[0-9]{4}-(SPRING|FALL)$')
);

CREATE INDEX students_program_id_idx ON students (program_id);

CREATE TRIGGER students_set_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- courses and their eligibility rules
--
-- Seat capacity is NOT stored here: it belongs to a course offering in a
-- registration window (registration_window_courses), so the same course can
-- be offered in several terms with independent seat counts.
-- ---------------------------------------------------------------------------
CREATE TABLE courses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  department_id UUID        NOT NULL REFERENCES departments (id) ON DELETE RESTRICT,
  credits       SMALLINT    NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  min_semester  SMALLINT    NOT NULL DEFAULT 1,
  min_credits   INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT courses_code_key UNIQUE (code),
  CONSTRAINT courses_code_format_check CHECK (code ~ '^[A-Z]{2,4}[0-9]{3}$'),
  CONSTRAINT courses_name_not_blank_check CHECK (btrim(name) <> ''),
  CONSTRAINT courses_credits_check CHECK (credits BETWEEN 1 AND 10),
  CONSTRAINT courses_min_semester_check CHECK (min_semester BETWEEN 1 AND 8),
  CONSTRAINT courses_min_credits_check CHECK (min_credits >= 0)
);

CREATE INDEX courses_department_id_idx ON courses (department_id);

CREATE TRIGGER courses_set_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A course may require other courses to have been passed first.
CREATE TABLE course_prerequisites (
  course_id              UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  prerequisite_course_id UUID NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
  PRIMARY KEY (course_id, prerequisite_course_id),
  CONSTRAINT course_prerequisites_not_self_check CHECK (course_id <> prerequisite_course_id)
);

CREATE INDEX course_prerequisites_prerequisite_idx ON course_prerequisites (prerequisite_course_id);

-- Programs allowed to take a course. A course with no rows is open to all programs.
CREATE TABLE course_eligible_programs (
  course_id  UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, program_id)
);

CREATE INDEX course_eligible_programs_program_idx ON course_eligible_programs (program_id);

-- Programs whose students receive the "program relevance" priority bonus.
CREATE TABLE course_program_relevance (
  course_id  UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, program_id)
);

CREATE INDEX course_program_relevance_program_idx ON course_program_relevance (program_id);

-- Courses a student has already passed (used for prerequisite checks).
CREATE TABLE student_completed_courses (
  student_id     UUID NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
  completed_term TEXT NOT NULL,
  PRIMARY KEY (student_id, course_id),
  CONSTRAINT student_completed_courses_term_format_check
    CHECK (completed_term ~ '^[0-9]{4}-(SPRING|FALL)$')
);

CREATE INDEX student_completed_courses_course_idx ON student_completed_courses (course_id);
