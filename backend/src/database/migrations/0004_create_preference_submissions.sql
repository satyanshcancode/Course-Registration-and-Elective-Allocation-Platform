-- Registration cart: one preference submission per student per window, with
-- up to five ranked courses. A submission starts as a DRAFT (saved cart) and
-- becomes SUBMITTED exactly once, atomically, with an idempotency key.

CREATE TABLE preference_submissions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID        NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
  window_id           UUID        NOT NULL REFERENCES registration_windows (id) ON DELETE CASCADE,
  status              TEXT        NOT NULL DEFAULT 'DRAFT',
  -- Client-generated key: a retried submit with the same key is recognised
  -- instead of creating a second submission.
  idempotency_key     UUID,
  -- Server-side arrival time and order; FCFS ranks by submission_sequence,
  -- never by any client-supplied timestamp.
  submitted_at        TIMESTAMPTZ,
  submission_sequence BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT preference_submissions_student_window_key UNIQUE (student_id, window_id),
  CONSTRAINT preference_submissions_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT preference_submissions_submission_sequence_key UNIQUE (submission_sequence),
  -- Target for preference_items' composite FK (ties items to the same window).
  CONSTRAINT preference_submissions_id_window_key UNIQUE (id, window_id),
  CONSTRAINT preference_submissions_status_check CHECK (status IN ('DRAFT', 'SUBMITTED')),
  CONSTRAINT preference_submissions_submitted_fields_check CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL AND submission_sequence IS NULL)
    OR (
      status = 'SUBMITTED'
      AND idempotency_key IS NOT NULL
      AND submitted_at IS NOT NULL
      AND submission_sequence IS NOT NULL
    )
  )
);

-- Assigned with nextval() at submit time. OWNED BY makes TRUNCATE ... RESTART
-- IDENTITY reset it together with the table.
CREATE SEQUENCE preference_submission_sequence
  OWNED BY preference_submissions.submission_sequence;

-- FCFS baseline reads submissions in arrival order per window.
CREATE INDEX preference_submissions_window_sequence_idx
  ON preference_submissions (window_id, submission_sequence)
  WHERE status = 'SUBMITTED';

CREATE TRIGGER preference_submissions_set_updated_at
  BEFORE UPDATE ON preference_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A SUBMITTED submission is final: it can be deleted (e.g. cascade from the
-- student) but never edited or turned back into a draft.
CREATE FUNCTION prevent_submitted_submission_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'SUBMITTED' THEN
    RAISE EXCEPTION 'Preference submission % is already submitted and cannot be changed', OLD.id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER preference_submissions_immutable_after_submit
  BEFORE UPDATE ON preference_submissions
  FOR EACH ROW EXECUTE FUNCTION prevent_submitted_submission_update();

-- ---------------------------------------------------------------------------
-- preference_items: the ranked courses of a submission
-- ---------------------------------------------------------------------------
CREATE TABLE preference_items (
  submission_id UUID     NOT NULL,
  -- Copied from the submission so the composite FKs below can guarantee
  -- that every ranked course is actually offered in that window.
  window_id     UUID     NOT NULL,
  course_id     UUID     NOT NULL,
  rank          SMALLINT NOT NULL,
  PRIMARY KEY (submission_id, rank),
  CONSTRAINT preference_items_submission_course_key UNIQUE (submission_id, course_id),
  CONSTRAINT preference_items_rank_check CHECK (rank BETWEEN 1 AND 5),
  CONSTRAINT preference_items_submission_fkey FOREIGN KEY (submission_id, window_id)
    REFERENCES preference_submissions (id, window_id) ON DELETE CASCADE,
  CONSTRAINT preference_items_offering_fkey FOREIGN KEY (window_id, course_id)
    REFERENCES registration_window_courses (window_id, course_id) ON DELETE CASCADE
);

-- Demand per course (catalogue "demand" and allocation input).
CREATE INDEX preference_items_window_course_idx ON preference_items (window_id, course_id);

-- Items of a SUBMITTED submission are frozen too.
CREATE FUNCTION prevent_submitted_items_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT status INTO parent_status
  FROM preference_submissions
  WHERE id = COALESCE(NEW.submission_id, OLD.submission_id);

  -- parent_status is NULL when the parent itself is being deleted (cascade).
  IF parent_status = 'SUBMITTED' THEN
    RAISE EXCEPTION 'Preferences of a submitted submission cannot be changed'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER preference_items_immutable_after_submit
  BEFORE INSERT OR UPDATE OR DELETE ON preference_items
  FOR EACH ROW EXECUTE FUNCTION prevent_submitted_items_change();
