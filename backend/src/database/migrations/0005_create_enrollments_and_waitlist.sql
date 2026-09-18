-- Enrollments (seats actually held) and waitlists for full offerings.

CREATE TABLE enrollments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
  window_id   UUID        NOT NULL,
  course_id   UUID        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'ACTIVE',
  source      TEXT        NOT NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dropped_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only courses offered in the window can be enrolled in.
  CONSTRAINT enrollments_offering_fkey FOREIGN KEY (window_id, course_id)
    REFERENCES registration_window_courses (window_id, course_id) ON DELETE CASCADE,
  CONSTRAINT enrollments_status_check CHECK (status IN ('ACTIVE', 'DROPPED')),
  CONSTRAINT enrollments_source_check CHECK (source IN ('ALLOCATION', 'WAITLIST_PROMOTION', 'ADD')),
  CONSTRAINT enrollments_dropped_at_check CHECK (
    (status = 'ACTIVE' AND dropped_at IS NULL)
    OR (status = 'DROPPED' AND dropped_at IS NOT NULL AND dropped_at >= enrolled_at)
  )
);

-- A student holds at most one ACTIVE seat in a course (dropped rows are kept as history).
CREATE UNIQUE INDEX enrollments_one_active_per_student_course_idx
  ON enrollments (student_id, course_id) WHERE status = 'ACTIVE';

CREATE INDEX enrollments_offering_idx ON enrollments (window_id, course_id, status);
CREATE INDEX enrollments_student_idx ON enrollments (student_id, status);

CREATE TRIGGER enrollments_set_updated_at
  BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Keeps registration_window_courses.allocated_count equal to the number of
-- ACTIVE enrollments. Because it UPDATEs the offering row, concurrent
-- enrollments in one offering serialise on that row lock, and the CHECK
-- (allocated_count <= capacity) rejects the statement that would overbook.
CREATE FUNCTION sync_offering_allocated_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Release first, so moving a seat never counts it twice.
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'ACTIVE' THEN
    UPDATE registration_window_courses
    SET allocated_count = allocated_count - 1
    WHERE window_id = OLD.window_id AND course_id = OLD.course_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'ACTIVE' THEN
    UPDATE registration_window_courses
    SET allocated_count = allocated_count + 1
    WHERE window_id = NEW.window_id AND course_id = NEW.course_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER enrollments_sync_allocated_count
  AFTER INSERT OR DELETE OR UPDATE OF status, window_id, course_id ON enrollments
  FOR EACH ROW EXECUTE FUNCTION sync_offering_allocated_count();

-- ---------------------------------------------------------------------------
-- waitlist_entries
--
-- Ordered by position (derived from the allocation score). Positions are not
-- renumbered when someone is promoted; gaps are fine because readers ORDER BY.
-- ---------------------------------------------------------------------------
CREATE TABLE waitlist_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
  window_id   UUID        NOT NULL,
  course_id   UUID        NOT NULL,
  score       INTEGER     NOT NULL DEFAULT 0,
  position    INTEGER     NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'WAITING',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at TIMESTAMPTZ,
  removed_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_entries_offering_fkey FOREIGN KEY (window_id, course_id)
    REFERENCES registration_window_courses (window_id, course_id) ON DELETE CASCADE,
  CONSTRAINT waitlist_entries_position_check CHECK (position > 0),
  CONSTRAINT waitlist_entries_status_check CHECK (status IN ('WAITING', 'PROMOTED', 'REMOVED')),
  CONSTRAINT waitlist_entries_status_timestamps_check CHECK (
    (status = 'WAITING' AND promoted_at IS NULL AND removed_at IS NULL)
    OR (status = 'PROMOTED' AND promoted_at IS NOT NULL AND removed_at IS NULL)
    OR (status = 'REMOVED' AND removed_at IS NOT NULL AND promoted_at IS NULL)
  )
);

-- One WAITING entry per student per course.
CREATE UNIQUE INDEX waitlist_entries_one_waiting_per_student_course_idx
  ON waitlist_entries (student_id, course_id) WHERE status = 'WAITING';

-- Waiting positions are unique within an offering, so "next in line" is unambiguous.
CREATE UNIQUE INDEX waitlist_entries_waiting_position_idx
  ON waitlist_entries (window_id, course_id, position) WHERE status = 'WAITING';

CREATE INDEX waitlist_entries_student_idx ON waitlist_entries (student_id, status);

CREATE TRIGGER waitlist_entries_set_updated_at
  BEFORE UPDATE ON waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
