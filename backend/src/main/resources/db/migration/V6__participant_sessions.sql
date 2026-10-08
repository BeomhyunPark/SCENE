-- Participant sessions last until logout. TTL and revoked_at stay open or proposed.
-- participant_access needs a tenant unique key so a session can reference that row.

ALTER TABLE participant_access
  ADD CONSTRAINT participant_access_event_space UNIQUE (space_id, event_id, id);

CREATE TABLE participant_sessions (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  participant_access_id uuid NOT NULL,
  token_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT participant_sessions_event_space UNIQUE (space_id, event_id, id),
  CONSTRAINT participant_sessions_token_hash UNIQUE (token_hash),
  FOREIGN KEY (space_id, event_id, participant_id)
    REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (space_id, event_id, participant_access_id)
    REFERENCES participant_access (space_id, event_id, id)
);
