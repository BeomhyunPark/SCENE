-- DEC-085 (#457 G2): rooms, the per-person room assignment, its history and publications, and the
-- room list switch on event_participant_settings. Additive only. Separate from groups (data-model
-- "no generic assignments table").

-- One row per event, made on the first change. No row means boardVersion 0.
CREATE TABLE room_boards (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  name varchar(50) NOT NULL,
  location_note varchar(100),
  capacity smallint CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 50),
  gender_option_id varchar(64),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  version integer NOT NULL CHECK (version >= 0),
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT rooms_event_space UNIQUE (space_id, event_id, id),
  CONSTRAINT rooms_name_per_event UNIQUE (space_id, event_id, name),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

-- Assigned people only; no row is unassigned. night 0 is the whole event (January uses 0 only;
-- G6 adds per-night rows). basis is what the assignment was made on, for "review again" (A11):
-- { genderOptionId, lodgingNights, slotIds }. No name, phone or answer text.
CREATE TABLE room_assignments (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  night smallint NOT NULL DEFAULT 0 CHECK (night >= 0),
  room_id uuid NOT NULL,
  basis jsonb NOT NULL,
  basis_at timestamptz NOT NULL,
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id, participant_id, night),
  CONSTRAINT room_assignments_basis_object CHECK (jsonb_typeof(basis) = 'object'),
  FOREIGN KEY (space_id, event_id, participant_id) REFERENCES participants (space_id, event_id, id),
  FOREIGN KEY (space_id, event_id, room_id) REFERENCES rooms (space_id, event_id, id)
);

CREATE INDEX room_assignments_room ON room_assignments (space_id, event_id, room_id);

-- Append-only history. Room ids have no foreign key so a deleted room keeps its history.
-- actor_user_id is null only for a withdraw the participant made themselves.
CREATE TABLE room_assignment_logs (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  night smallint NOT NULL DEFAULT 0,
  from_room_id uuid,
  to_room_id uuid,
  cause varchar(16) NOT NULL CHECK (cause IN ('MOVE', 'ROOM_DELETED', 'WITHDRAWN')),
  actor_user_id uuid REFERENCES users (id),
  created_at timestamptz NOT NULL,
  CONSTRAINT room_assignment_logs_actor CHECK (cause = 'WITHDRAWN' OR actor_user_id IS NOT NULL),
  FOREIGN KEY (space_id, event_id, participant_id) REFERENCES participants (space_id, event_id, id)
);

CREATE INDEX room_assignment_logs_participant
  ON room_assignment_logs (space_id, event_id, participant_id, seq);

-- Publication snapshot:
-- { rooms: [ { roomId, name, locationNote, capacity, genderOptionId, sortOrder, memberIds } ] }
CREATE TABLE room_publications (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  board_version bigint NOT NULL CHECK (board_version >= 0),
  snapshot jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES users (id),
  published_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE INDEX room_publications_latest ON room_publications (space_id, event_id, seq DESC);

-- DEC-085 §8.1: what participants see of the room list. Default ALL (user decision 2026-11-19).
ALTER TABLE event_participant_settings
  ADD COLUMN room_roster_scope varchar(16) NOT NULL DEFAULT 'ALL'
  CHECK (room_roster_scope IN ('ALL', 'ROOMMATES', 'MY_ROOM'));
