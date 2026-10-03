-- Co-administrators: a second staff role that runs registration day to day but
-- cannot touch staff accounts.
--
-- A CO_ADMIN may do everything an ADMIN does — students, imports, courses, the
-- registration window, allocation, waitlists, the add/drop period — except
-- create, invite, deactivate or reactivate another member of staff. That one
-- exception is what stops the role from being a way to grant itself more.
--
-- Two changes only:
--
--   1. users_role_check admits the new value. The constraint is dropped and
--      re-added rather than edited, because a CHECK cannot be altered in place
--      (the same reason migration 0012 replaced the bcrypt check).
--   2. users gains display_name, the staff member's name. A student's name is
--      part of their academic record and lives on students.name, which the
--      registrar maintains and eligibility is judged on; a staff name is only
--      ever a label on a screen and in the greeting of an invitation e-mail,
--      so it belongs here and stays nullable for the accounts that predate it.

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('STUDENT', 'ADMIN', 'CO_ADMIN'));

-- students_user_role_check already pins a profile to role = 'STUDENT', so a
-- co-admin can never acquire one, and the (id, role) foreign key means a role
-- change would break the reference rather than silently orphan the profile.

ALTER TABLE users ADD COLUMN display_name TEXT;

ALTER TABLE users ADD CONSTRAINT users_display_name_length_check
  CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 120);

-- Staff are listed by role and status on the Team page; students never are.
CREATE INDEX users_staff_idx ON users (role, is_active)
  WHERE role IN ('ADMIN', 'CO_ADMIN');
