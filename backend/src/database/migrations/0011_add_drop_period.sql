-- Add/drop (Phase 10): the period an admin opens after allocation, the extra
-- reasons a seat or a queue place can end, and the idempotency ledger that
-- makes retrying a drop, add or swap free.
--
-- The one-elective-per-student model still holds, and from here it is enforced
-- by the database rather than only by the services: add, swap and promotion all
-- insert enrollments, so the invariant needs a backstop none of them can miss.

-- ---------------------------------------------------------------------------
-- The add/drop period. Both ends or neither: a window with only an opening
-- time would be a period that never closes.
--
-- Deliberately NOT part of the frozen policy (migration 0008): the period is
-- scheduling, not an allocation rule, and an admin must be able to extend it
-- while the window is ALLOCATED.
-- ---------------------------------------------------------------------------
ALTER TABLE registration_windows
  ADD COLUMN add_drop_opens_at  TIMESTAMPTZ,
  ADD COLUMN add_drop_closes_at TIMESTAMPTZ;

ALTER TABLE registration_windows ADD CONSTRAINT registration_windows_add_drop_dates_check CHECK (
  (add_drop_opens_at IS NULL AND add_drop_closes_at IS NULL)
  OR (add_drop_opens_at IS NOT NULL AND add_drop_closes_at IS NOT NULL
      AND add_drop_closes_at > add_drop_opens_at)
);

-- ---------------------------------------------------------------------------
-- A seat can now also be released by its own holder, either outright or to
-- take another course in the same action.
-- ---------------------------------------------------------------------------
ALTER TABLE enrollments DROP CONSTRAINT enrollments_drop_reason_check;

ALTER TABLE enrollments ADD CONSTRAINT enrollments_drop_reason_check CHECK (
  (status = 'ACTIVE' AND drop_reason IS NULL)
  OR (status = 'DROPPED'
      AND drop_reason IN ('UPGRADED', 'ADMIN_WITHDRAWAL', 'STUDENT_DROP', 'SWAPPED'))
);

-- One elective per student per window. Two simultaneous adds by one student
-- lock different offering rows, so nothing in the row locks alone would stop
-- them both succeeding; this index does, whatever the application does.
--
-- It also fixes the order every seat move must take: release the old seat
-- BEFORE inserting the new one, never the other way round.
CREATE UNIQUE INDEX enrollments_one_active_per_student_window_idx
  ON enrollments (student_id, window_id) WHERE status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Two more ways a waiting entry ends: the student left the queue themselves,
-- or they took a seat elsewhere and the entry was one they joined during
-- add/drop rather than ranked, so "is this an upgrade?" has no answer.
-- ---------------------------------------------------------------------------
ALTER TABLE waitlist_entries DROP CONSTRAINT waitlist_entries_removal_reason_check;

ALTER TABLE waitlist_entries ADD CONSTRAINT waitlist_entries_removal_reason_check CHECK (
  (status = 'REMOVED'
   AND removal_reason IN ('INELIGIBLE', 'RANKED_BELOW_SEAT', 'STUDENT_LEFT', 'SEAT_ELSEWHERE'))
  OR (status <> 'REMOVED' AND removal_reason IS NULL)
);

-- ---------------------------------------------------------------------------
-- The student timeline gains the add/drop events.
-- ---------------------------------------------------------------------------
ALTER TABLE registration_history DROP CONSTRAINT registration_history_event_type_check;

ALTER TABLE registration_history ADD CONSTRAINT registration_history_event_type_check CHECK (
  event_type IN (
    'DRAFT_SAVED',
    'SUBMITTED',
    'ALLOCATED',
    'WAITLISTED',
    'NOT_ALLOCATED',
    'PROMOTED',
    'ADDED',
    'DROPPED',
    'SWAPPED',
    'WAITLIST_JOINED',
    'WAITLIST_LEFT',
    'WAITLIST_REMOVED'
  )
);

-- ---------------------------------------------------------------------------
-- add_drop_requests: the idempotency ledger.
--
-- Phase 7 could keep the key on preference_submissions, because a student has
-- exactly one of those. Add/drop actions repeat, so the keys need a table of
-- their own. One row per attempt, holding the reply that was sent, so a retry
-- with the same key replays it instead of acting twice.
-- ---------------------------------------------------------------------------
CREATE TABLE add_drop_requests (
  idempotency_key UUID        PRIMARY KEY,
  student_id      UUID        NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
  window_id       UUID        NOT NULL REFERENCES registration_windows (id) ON DELETE CASCADE,
  action          TEXT        NOT NULL,
  -- The request this key belongs to, so the same key with a DIFFERENT request
  -- is refused rather than replaying somebody else's answer.
  request         JSONB       NOT NULL,
  -- The reply that was sent; null while the transaction is still running.
  result          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT add_drop_requests_action_check CHECK (
    action IN ('DROP', 'ADD', 'SWAP', 'WAITLIST_JOIN', 'WAITLIST_LEAVE')
  ),
  CONSTRAINT add_drop_requests_request_object_check CHECK (jsonb_typeof(request) = 'object')
);

CREATE INDEX add_drop_requests_student_idx ON add_drop_requests (student_id, created_at DESC);

CREATE TRIGGER add_drop_requests_set_updated_at
  BEFORE UPDATE ON add_drop_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
