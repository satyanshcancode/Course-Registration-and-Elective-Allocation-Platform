-- A completed run has to answer two questions later: "what did it produce?"
-- and "would it produce that again?". The metrics answer the first without
-- re-reading every result row; the output hash answers the second.

ALTER TABLE allocation_runs
  ADD COLUMN metrics     JSONB,
  ADD COLUMN output_hash TEXT;

ALTER TABLE allocation_runs
  ADD CONSTRAINT allocation_runs_metrics_check
    CHECK (metrics IS NULL OR jsonb_typeof(metrics) = 'object'),
  -- sha256, lower-case hex.
  ADD CONSTRAINT allocation_runs_output_hash_format_check
    CHECK (output_hash IS NULL OR output_hash ~ '^[0-9a-f]{64}$'),
  -- A completed run always carries both; a running or failed one carries neither.
  ADD CONSTRAINT allocation_runs_completed_payload_check
    CHECK (status <> 'COMPLETED' OR (metrics IS NOT NULL AND output_hash IS NOT NULL));

-- ---------------------------------------------------------------------------
-- allocation_results stores the structured explanation next to the sentence,
-- so the student UI can build its own wording (and stay translatable) while
-- the row still reads sensibly in psql.
-- ---------------------------------------------------------------------------
ALTER TABLE allocation_results
  ADD COLUMN explanation_detail JSONB,
  ADD COLUMN waitlist_position  INTEGER;

ALTER TABLE allocation_results
  ADD CONSTRAINT allocation_results_explanation_detail_check
    CHECK (explanation_detail IS NULL OR jsonb_typeof(explanation_detail) = 'object'),
  ADD CONSTRAINT allocation_results_waitlist_position_check
    CHECK (waitlist_position IS NULL OR waitlist_position > 0),
  -- Only a waitlisted row has a place in a queue.
  ADD CONSTRAINT allocation_results_waitlist_outcome_check
    CHECK ((outcome = 'WAITLISTED') = (waitlist_position IS NOT NULL));
