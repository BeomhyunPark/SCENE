-- Operator withdraw and restore of an application (DEC-084, #338, #420). Additive only: code from
-- before this migration still runs against it.

-- Append-only history of status changes that are not edits. The application row itself only
-- changes status (SUBMITTED <-> WITHDRAWN); this table keeps who did it, when, and why. reason is
-- operator text like the operator memo and is never copied into audit_logs. block_reapply marks a
-- withdraw that also made the six-digit number unusable. The operator notifications (I3) read
-- these rows. seq orders rows written in the same instant.
CREATE TABLE application_status_logs (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  application_id uuid NOT NULL,
  action varchar(16) NOT NULL CHECK (action IN ('WITHDRAWN', 'RESTORED')),
  reason varchar(200),
  block_reapply boolean NOT NULL DEFAULT false,
  actor_kind varchar(16) NOT NULL CHECK (actor_kind IN ('OPERATOR', 'PARTICIPANT')),
  actor_user_id uuid REFERENCES users (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT application_status_logs_actor CHECK (
    (actor_kind = 'OPERATOR') = (actor_user_id IS NOT NULL)),
  CONSTRAINT application_status_logs_reason CHECK (action = 'WITHDRAWN' OR reason IS NULL),
  FOREIGN KEY (space_id, event_id, participant_id)
    REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (space_id, event_id, application_id)
    REFERENCES applications (space_id, event_id, id)
);

CREATE INDEX application_status_logs_participant
  ON application_status_logs (space_id, event_id, participant_id, seq);

CREATE INDEX application_status_logs_event ON application_status_logs (space_id, event_id, seq);

-- A withdraw removes the working-copy assignment in the same transaction (DEC-072 §5) and logs it
-- with its own cause, so the board can show "철회됨 · 이전 조" from the history.
ALTER TABLE group_assignment_logs DROP CONSTRAINT group_assignment_logs_cause_check;
ALTER TABLE group_assignment_logs ADD CONSTRAINT group_assignment_logs_cause_check
  CHECK (cause IN ('MOVE', 'LEADER', 'GROUP_DELETED', 'WITHDRAWN'));
