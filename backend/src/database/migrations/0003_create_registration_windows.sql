-- Registration windows and the courses (offerings) each one makes available.

CREATE TABLE registration_windows (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  term              TEXT        NOT NULL,
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'DRAFT',
  allocation_method TEXT        NOT NULL,
  -- AllocationConfig (shared/src/domain/allocationConfig.ts), e.g.
  -- {"method":"PREFERENCE_PRIORITY","preferenceWeights":{...},"priorityPoints":{...}}
  config            JSONB       NOT NULL,
  -- Seed for the deterministic tie-break generator (unsigned 32-bit).
  random_seed       BIGINT      NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT registration_windows_name_key UNIQUE (name),
  CONSTRAINT registration_windows_term_format_check CHECK (term ~ '^[0-9]{4}-(SPRING|FALL)$'),
  CONSTRAINT registration_windows_dates_check CHECK (ends_at > starts_at),
  CONSTRAINT registration_windows_status_check
    CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'ALLOCATED')),
  CONSTRAINT registration_windows_allocation_method_check
    CHECK (allocation_method IN ('FCFS', 'PREFERENCE_PRIORITY')),
  CONSTRAINT registration_windows_config_object_check CHECK (jsonb_typeof(config) = 'object'),
  -- The config's discriminant must agree with the method column.
  CONSTRAINT registration_windows_config_method_check CHECK (config ->> 'method' = allocation_method),
  CONSTRAINT registration_windows_preference_priority_config_check CHECK (
    allocation_method <> 'PREFERENCE_PRIORITY'
    OR (
      jsonb_typeof(config -> 'preferenceWeights') = 'object'
      AND jsonb_typeof(config -> 'priorityPoints') = 'object'
    )
  ),
  CONSTRAINT registration_windows_random_seed_check CHECK (random_seed BETWEEN 0 AND 4294967295)
);

-- At most one window may be OPEN at any time.
CREATE UNIQUE INDEX registration_windows_single_open_idx
  ON registration_windows ((true)) WHERE status = 'OPEN';

CREATE INDEX registration_windows_status_idx ON registration_windows (status);

CREATE TRIGGER registration_windows_set_updated_at
  BEFORE UPDATE ON registration_windows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- registration_window_courses: a course offered in a window ("offering").
--
-- Seat counts live here. The CHECK on allocated_count is the last line of
-- defence against overbooking: no statement can leave more ACTIVE
-- enrollments than capacity, whatever the application does.
-- allocated_count is maintained by a trigger on enrollments (migration 0005).
-- ---------------------------------------------------------------------------
CREATE TABLE registration_window_courses (
  window_id       UUID        NOT NULL REFERENCES registration_windows (id) ON DELETE CASCADE,
  course_id       UUID        NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
  capacity        INTEGER     NOT NULL,
  allocated_count INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (window_id, course_id),
  CONSTRAINT registration_window_courses_capacity_check CHECK (capacity >= 0),
  CONSTRAINT registration_window_courses_allocated_count_check
    CHECK (allocated_count >= 0 AND allocated_count <= capacity)
);

CREATE INDEX registration_window_courses_course_idx ON registration_window_courses (course_id);

CREATE TRIGGER registration_window_courses_set_updated_at
  BEFORE UPDATE ON registration_window_courses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
