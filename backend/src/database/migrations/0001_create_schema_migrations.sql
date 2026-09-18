-- Tracks which migration files have been applied.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT        PRIMARY KEY CHECK (version ~ '^[0-9]{4}$'),
  name       TEXT        NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
