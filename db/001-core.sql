CREATE TABLE routine_revisions (
  household_id text NOT NULL, revision_id text NOT NULL, routine_id text NOT NULL,
  content jsonb NOT NULL, content_hash text NOT NULL CHECK (length(content_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, revision_id), UNIQUE (household_id, revision_id, content_hash),
  UNIQUE (household_id, routine_id, revision_id)
);
CREATE TABLE routine_heads (
  household_id text NOT NULL, routine_id text NOT NULL, revision_id text NOT NULL,
  PRIMARY KEY (household_id, routine_id),
  FOREIGN KEY (household_id, routine_id, revision_id)
    REFERENCES routine_revisions (household_id, routine_id, revision_id)
);
CREATE TABLE approvals (
  household_id text NOT NULL, revision_id text NOT NULL, content_hash text NOT NULL,
  actor text NOT NULL, approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, revision_id),
  FOREIGN KEY (household_id, revision_id, content_hash)
    REFERENCES routine_revisions (household_id, revision_id, content_hash)
);
CREATE TABLE devices (
  household_id text NOT NULL, device_id text NOT NULL, state text NOT NULL,
  PRIMARY KEY (household_id, device_id),
  CHECK ((device_id = 'porch-light' AND state IN ('off','on')) OR (device_id = 'front-door' AND state = 'locked'))
);
CREATE TABLE events (
  household_id text NOT NULL, event_id text NOT NULL, payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (length(payload_hash) = 64),
  PRIMARY KEY (household_id, event_id)
);
CREATE TABLE decisions (
  decision_id uuid PRIMARY KEY, household_id text NOT NULL, event_id text NOT NULL,
  evidence jsonb NOT NULL, UNIQUE (household_id, event_id),
  FOREIGN KEY (household_id, event_id) REFERENCES events
);
CREATE TABLE actions (
  action_id uuid PRIMARY KEY, decision_id uuid NOT NULL REFERENCES decisions,
  ordinal integer NOT NULL CHECK (ordinal >= 0), device_id text NOT NULL,
  action text NOT NULL, before_state text NOT NULL, after_state text NOT NULL,
  UNIQUE (decision_id, ordinal),
  CHECK (device_id = 'porch-light' AND action = 'turn_on' AND after_state = 'on')
);
