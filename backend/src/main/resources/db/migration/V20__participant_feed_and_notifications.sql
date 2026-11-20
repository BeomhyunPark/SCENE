-- DEC-080 (#379 B2, #423). Participant home refresh values and the per-recipient notification list.
-- Additive only: two new tables. operator_notices stays as it is; I3 moves its rows.

-- One list for participant and operator notifications. seq orders the list and "read up to".
-- A row is merged (deleted and inserted again with count + 1) while it is unread (§7.3).
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  recipient_kind varchar(16) NOT NULL CHECK (recipient_kind IN ('PARTICIPANT', 'OPERATOR')),
  recipient_participant_id uuid,
  recipient_user_id uuid REFERENCES users (id),
  kind varchar(64) NOT NULL,
  target_type varchar(32) NOT NULL,
  target_id uuid,
  title varchar(80) NOT NULL,
  body varchar(200),
  important boolean NOT NULL DEFAULT false,
  count integer NOT NULL DEFAULT 1 CHECK (count >= 1),
  created_at timestamptz NOT NULL,
  read_at timestamptz,
  CONSTRAINT notifications_one_recipient CHECK (
    (recipient_kind = 'PARTICIPANT' AND recipient_participant_id IS NOT NULL
      AND recipient_user_id IS NULL)
    OR (recipient_kind = 'OPERATOR' AND recipient_user_id IS NOT NULL
      AND recipient_participant_id IS NULL)),
  FOREIGN KEY (space_id, event_id, recipient_participant_id)
    REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE INDEX notifications_participant
  ON notifications (recipient_participant_id, seq DESC)
  WHERE recipient_participant_id IS NOT NULL;
CREATE INDEX notifications_participant_unread
  ON notifications (recipient_participant_id)
  WHERE recipient_participant_id IS NOT NULL AND read_at IS NULL;
CREATE INDEX notifications_operator
  ON notifications (event_id, recipient_user_id, seq DESC)
  WHERE recipient_user_id IS NOT NULL;
CREATE INDEX notifications_target ON notifications (event_id, target_type, target_id);

-- Event-scope refresh values. One row per event, made on the first bump; no row reads as all 0.
-- Each publish path adds 1 to its column in the publish transaction.
CREATE TABLE participant_feed_versions (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  home bigint NOT NULL DEFAULT 0,
  schedule bigint NOT NULL DEFAULT 0,
  notices bigint NOT NULL DEFAULT 0,
  groups bigint NOT NULL DEFAULT 0,
  rooms bigint NOT NULL DEFAULT 0,
  meal_order bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

-- Events that already published groups start with groups = number of publications, so the groups
-- area stays on (a value above 0 means something was published, DEC-080 §2 rule 3).
INSERT INTO participant_feed_versions (space_id, event_id, groups, updated_at)
SELECT space_id, event_id, count(*), now()
FROM group_publications
GROUP BY space_id, event_id;
