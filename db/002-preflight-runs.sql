-- Additive and insert-only: saved preflight test runs. Never read by event processing.
CREATE TABLE preflight_runs (
  run_id uuid PRIMARY KEY, household_id text NOT NULL, routine_revision_id text NOT NULL,
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX preflight_runs_household_created ON preflight_runs (household_id, created_at DESC);
