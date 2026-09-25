-- Waitlist promotion (Phase 9).
--
-- Promotion needs to say WHY a seat was released and WHY a waitlist entry
-- ended, and the student-facing pages read that reason directly rather than
-- reconstructing it from registration_history. Both columns are plain TEXT +
-- CHECK, mirroring the const tuples in shared/src/domain/enums.ts.

ALTER TABLE enrollments ADD COLUMN drop_reason TEXT;

ALTER TABLE enrollments ADD CONSTRAINT enrollments_drop_reason_check CHECK (
  (status = 'ACTIVE' AND drop_reason IS NULL)
  OR (status = 'DROPPED' AND drop_reason IN ('UPGRADED', 'ADMIN_WITHDRAWAL', 'STUDENT_DROP'))
);

ALTER TABLE waitlist_entries ADD COLUMN removal_reason TEXT;

-- A REMOVED entry always carries its reason; a WAITING or PROMOTED one never does.
ALTER TABLE waitlist_entries ADD CONSTRAINT waitlist_entries_removal_reason_check CHECK (
  (status = 'REMOVED' AND removal_reason IN ('INELIGIBLE', 'RANKED_BELOW_SEAT'))
  OR (status <> 'REMOVED' AND removal_reason IS NULL)
);
