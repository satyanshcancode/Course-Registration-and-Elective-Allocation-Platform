-- Registration history (student-facing timeline), notifications and the
-- audit log. History and audit rows are append-only.

-- Rejects UPDATEs on append-only tables. (DELETE stays possible so that
-- ON DELETE CASCADE from a removed student still works.)
CREATE FUNCTION prevent_update_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; rows cannot be updated', TG_TABLE_NAME
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE TABLE registration_history (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID        NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
  window_id  UUID        REFERENCES registration_windows (id) ON DELETE SET NULL,
  course_id  UUID        REFERENCES courses (id) ON DELETE SET NULL,
  event_type TEXT        NOT NULL,
  details    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT registration_history_event_type_check CHECK (
    event_type IN (
      'DRAFT_SAVED',
      'SUBMITTED',
      'ALLOCATED',
      'WAITLISTED',
      'NOT_ALLOCATED',
      'PROMOTED',
      'ADDED',
      'DROPPED',
      'WAITLIST_REMOVED'
    )
  ),
  CONSTRAINT registration_history_details_check CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX registration_history_student_idx
  ON registration_history (student_id, created_at DESC, id DESC);

CREATE TRIGGER registration_history_append_only
  BEFORE UPDATE ON registration_history
  FOR EACH ROW EXECUTE FUNCTION prevent_update_append_only();

-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL DEFAULT '',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (
    type IN (
      'ALLOCATION_RESULT',
      'WAITLIST_PROMOTION',
      'ENROLLMENT_CHANGE',
      'WINDOW_STATUS',
      'SYSTEM'
    )
  ),
  CONSTRAINT notifications_title_not_blank_check CHECK (btrim(title) <> '')
);

CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID        REFERENCES users (id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  entity_type   TEXT        NOT NULL,
  -- TEXT so composite keys (e.g. "windowId:courseId") fit too.
  entity_id     TEXT        NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_action_not_blank_check CHECK (btrim(action) <> ''),
  CONSTRAINT audit_logs_entity_type_not_blank_check CHECK (btrim(entity_type) <> '')
);

CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, created_at DESC);

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_update_append_only();
