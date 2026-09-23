-- Freezes the allocation policy once a registration window leaves DRAFT.
--
-- Students submit their preferences against a published policy, so the rules
-- that decide who gets a seat must not change underneath them. The service
-- refuses such a change first (see services/registrationWindowService.ts);
-- these triggers are the backstop that holds even if application code is
-- wrong, a migration script is run by hand, or two requests race.
--
-- Frozen: allocation_method, config (weights and priority points),
--         random_seed, and the SET of offered courses.
-- Still allowed: the status transitions themselves, the window's name, term
--         and schedule, and a course's capacity (admins may add or remove
--         seats during registration — see 0003 and the capacity audit trail).

CREATE FUNCTION freeze_registration_policy() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
       NEW.allocation_method IS DISTINCT FROM OLD.allocation_method
       OR NEW.config         IS DISTINCT FROM OLD.config
       OR NEW.random_seed    IS DISTINCT FROM OLD.random_seed
     ) THEN
    RAISE EXCEPTION
      'Registration window % is %; its allocation policy is frozen', OLD.id, OLD.status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER registration_windows_freeze_policy
  BEFORE UPDATE ON registration_windows
  FOR EACH ROW EXECUTE FUNCTION freeze_registration_policy();

-- ---------------------------------------------------------------------------
-- The set of offered courses is part of the frozen policy: a course may not be
-- added to, or removed from, a window that is no longer a draft. Capacity
-- updates on an existing offering are deliberately not covered here.
-- ---------------------------------------------------------------------------
CREATE FUNCTION freeze_window_offerings() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected_window UUID := COALESCE(NEW.window_id, OLD.window_id);
  window_status   TEXT;
BEGIN
  SELECT status INTO window_status FROM registration_windows WHERE id = affected_window;

  IF window_status IS NOT NULL AND window_status <> 'DRAFT' THEN
    RAISE EXCEPTION
      'Registration window % is %; its offered courses are frozen', affected_window, window_status
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER registration_window_courses_freeze_offerings
  BEFORE INSERT OR DELETE ON registration_window_courses
  FOR EACH ROW EXECUTE FUNCTION freeze_window_offerings();
