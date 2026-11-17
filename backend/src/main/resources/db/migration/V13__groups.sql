-- Group assignment working copy (#299, DEC-072). Publication snapshots are #300 and add their own
-- table; these four tables stay as they are.
-- Names, phones, and answers are not copied here; the participant and answer rows stay the source.

-- One row per event, written on the first change. boardVersion is 0 until then.
CREATE TABLE group_boards (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

-- sort_order has no unique key so a reorder can rewrite every row. Reads order by (sort_order, id).
CREATE TABLE groups (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  name varchar(50) NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  version integer NOT NULL CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT groups_event_space UNIQUE (space_id, event_id, id),
  CONSTRAINT groups_name_per_event UNIQUE (space_id, event_id, name),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

-- One row per assigned participant. Unassigned means no row. leader marks a group leader, who is
-- always a member of that group; moving or unassigning the participant clears it.
-- Rows of withdrawn participants stay; reads leave them out (DEC-072 §5).
CREATE TABLE group_assignments (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  group_id uuid NOT NULL,
  leader boolean NOT NULL,
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id, participant_id),
  FOREIGN KEY (space_id, event_id, participant_id)
    REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (space_id, event_id, group_id) REFERENCES groups (space_id, event_id, id)
);

CREATE INDEX group_assignments_group ON group_assignments (space_id, event_id, group_id);

-- Append-only history. Group ids have no foreign key because a deleted group keeps its history.
-- seq orders rows written in the same instant.
CREATE TABLE group_assignment_logs (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  from_group_id uuid,
  to_group_id uuid,
  leader_before boolean NOT NULL,
  leader_after boolean NOT NULL,
  cause varchar(16) NOT NULL CHECK (cause IN ('MOVE', 'LEADER', 'GROUP_DELETED')),
  actor_user_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT group_assignment_logs_leader_member CHECK (
    (NOT leader_before OR from_group_id IS NOT NULL)
    AND (NOT leader_after OR to_group_id IS NOT NULL)),
  FOREIGN KEY (space_id, event_id, participant_id)
    REFERENCES participants (space_id, event_id, id)
);

CREATE INDEX group_assignment_logs_participant
  ON group_assignment_logs (space_id, event_id, participant_id, seq);
