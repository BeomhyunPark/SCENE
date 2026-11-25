-- DEC-083 (#452 F2). Additive only: two new tables.

-- Personal-information views whose actor may be a participant (audit_logs.actor_user_id takes
-- operators only). A row never holds a number, a name, or an answer value; detail names the fields.
-- Rows go with the event's data (DEC-056).
CREATE TABLE privacy_logs (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  action varchar(32) NOT NULL CHECK (action IN ('CONTACT_VIEW')),
  actor_kind varchar(16) NOT NULL CHECK (actor_kind IN ('PARTICIPANT', 'OPERATOR')),
  actor_participant_id uuid,
  actor_user_id uuid REFERENCES users (id),
  subject_participant_id uuid NOT NULL,
  channel varchar(48) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT privacy_logs_detail_object CHECK (jsonb_typeof(detail) = 'object'),
  CONSTRAINT privacy_logs_one_actor CHECK (
    (actor_kind = 'PARTICIPANT' AND actor_participant_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_kind = 'OPERATOR' AND actor_user_id IS NOT NULL AND actor_participant_id IS NULL)),
  FOREIGN KEY (space_id, event_id, actor_participant_id)
    REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (space_id, event_id, subject_participant_id)
    REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE INDEX privacy_logs_subject
  ON privacy_logs (space_id, event_id, subject_participant_id, seq);

-- What participants of one event see of each other (DEC-083 §2). No row means the defaults and
-- version 0. G1 adds the room list switch here.
CREATE TABLE event_participant_settings (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  group_roster_visible_to_members boolean NOT NULL DEFAULT true,
  version integer NOT NULL CHECK (version >= 1),
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
