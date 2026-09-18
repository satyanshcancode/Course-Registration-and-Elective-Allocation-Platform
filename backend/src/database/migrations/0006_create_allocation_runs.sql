-- Allocation runs and their per-student, per-course results. A run stores
-- everything needed to reproduce it: method, algorithm version, seed, config
-- and a snapshot of the inputs.

CREATE TABLE allocation_runs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: runs are an audit record; a window with runs cannot be deleted.
  window_id         UUID        NOT NULL REFERENCES registration_windows (id) ON DELETE RESTRICT,
  method            TEXT        NOT NULL,
  algorithm_version TEXT        NOT NULL,
  random_seed       BIGINT      NOT NULL,
  config_snapshot   JSONB       NOT NULL,
  input_snapshot    JSONB       NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'RUNNING',
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  error_message     TEXT,
  triggered_by      UUID        REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT allocation_runs_method_check CHECK (method IN ('FCFS', 'PREFERENCE_PRIORITY')),
  CONSTRAINT allocation_runs_algorithm_version_check CHECK (btrim(algorithm_version) <> ''),
  CONSTRAINT allocation_runs_random_seed_check CHECK (random_seed BETWEEN 0 AND 4294967295),
  CONSTRAINT allocation_runs_config_snapshot_check CHECK (
    jsonb_typeof(config_snapshot) = 'object' AND config_snapshot ->> 'method' = method
  ),
  CONSTRAINT allocation_runs_input_snapshot_check CHECK (jsonb_typeof(input_snapshot) = 'object'),
  CONSTRAINT allocation_runs_status_check CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  CONSTRAINT allocation_runs_finished_check CHECK (
    (status = 'RUNNING' AND finished_at IS NULL)
    OR (status IN ('COMPLETED', 'FAILED') AND finished_at IS NOT NULL AND finished_at >= started_at)
  ),
  CONSTRAINT allocation_runs_failure_reason_check CHECK (status <> 'FAILED' OR error_message IS NOT NULL)
);

-- Never two allocation runs in progress for the same window.
CREATE UNIQUE INDEX allocation_runs_single_running_idx
  ON allocation_runs (window_id) WHERE status = 'RUNNING';

CREATE INDEX allocation_runs_window_idx ON allocation_runs (window_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- allocation_results: one row per (run, student, ranked course).
-- Score columns are NULL for methods that do not score (FCFS).
-- ---------------------------------------------------------------------------
CREATE TABLE allocation_results (
  id               BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id           UUID        NOT NULL REFERENCES allocation_runs (id) ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES students (user_id) ON DELETE CASCADE,
  course_id        UUID        NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
  outcome          TEXT        NOT NULL,
  preference_rank  SMALLINT    NOT NULL,
  preference_score INTEGER,
  priority_score   INTEGER,
  total_score      INTEGER,
  -- 1 = first in line for this course in this run.
  final_rank       INTEGER     NOT NULL,
  explanation      TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT allocation_results_run_student_course_key UNIQUE (run_id, student_id, course_id),
  CONSTRAINT allocation_results_run_course_rank_key UNIQUE (run_id, course_id, final_rank),
  CONSTRAINT allocation_results_outcome_check
    CHECK (outcome IN ('ALLOCATED', 'WAITLISTED', 'NOT_ALLOCATED')),
  CONSTRAINT allocation_results_preference_rank_check CHECK (preference_rank BETWEEN 1 AND 5),
  CONSTRAINT allocation_results_final_rank_check CHECK (final_rank > 0),
  CONSTRAINT allocation_results_total_score_check CHECK (
    total_score IS NULL
    OR preference_score IS NULL
    OR priority_score IS NULL
    OR total_score = preference_score + priority_score
  ),
  CONSTRAINT allocation_results_explanation_check CHECK (btrim(explanation) <> '')
);

CREATE INDEX allocation_results_student_idx ON allocation_results (student_id, run_id);
