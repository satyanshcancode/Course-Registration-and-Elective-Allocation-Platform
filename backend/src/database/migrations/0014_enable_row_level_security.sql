-- Row Level Security (RLS) hardening.
--
-- Supabase exposes all tables in the public schema via its PostgREST API.
-- Because this platform handles authentication and authorization in the Express
-- backend (cookie-based JWT sessions, role middleware, parameterised queries),
-- client requests must never access the database directly.
--
-- Enabling RLS on every table without defining any permissive policies ensures
-- that PostgreSQL enforces a default-deny policy for unprivileged client roles
-- (e.g. Supabase anon and authenticated roles).
--
-- The Express backend connects via DATABASE_URL as the database owner (the
-- postgres user / superuser), which bypasses RLS in PostgreSQL. This locks down
-- public PostgREST access while leaving backend operations completely unaffected.

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_eligible_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_program_relevance ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_completed_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_window_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE preference_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE preference_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE add_drop_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_tokens ENABLE ROW LEVEL SECURITY;

