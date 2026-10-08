-- Public submit stores the participant and the access-key hash with the application.
-- Participant status values are unset, so this table has no status column.
-- revoked_at stays a proposal and is not stored.

CREATE TABLE participants (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  name varchar(200) NOT NULL,
  phone varchar(50) NOT NULL,
  phone_hash varchar(64) NOT NULL,
  phone_last4 varchar(4) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT participants_event_space UNIQUE (space_id, event_id, id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE TABLE participant_access (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  key_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (space_id, event_id, participant_id)
    REFERENCES participants (space_id, event_id, id)
);

ALTER TABLE applications
  ADD COLUMN participant_id uuid NOT NULL,
  ADD CONSTRAINT applications_participant
    FOREIGN KEY (space_id, event_id, participant_id)
    REFERENCES participants (space_id, event_id, id);
