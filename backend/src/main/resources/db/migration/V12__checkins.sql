-- Arrival check-in (#282, DEC-071). One current row per participant and an append-only history.
-- Cancelling changes the current row and adds a history row. Check-in again reuses the same row.
-- Names and phone numbers are not copied here; the participant row stays the only source.

CREATE TABLE checkins (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('CHECKED_IN', 'CANCELLED')),
  method varchar(16) NOT NULL CHECK (method IN ('QR', 'MANUAL')),
  checked_in_at timestamptz NOT NULL,
  checked_in_by uuid NOT NULL REFERENCES users (id),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users (id),
  cancel_reason varchar(200),
  CONSTRAINT checkins_event_space UNIQUE (space_id, event_id, id),
  CONSTRAINT checkins_one_per_participant UNIQUE (space_id, event_id, participant_id),
  CONSTRAINT checkins_cancel_shape CHECK (
    (status = 'CHECKED_IN'
      AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
    OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id),
  FOREIGN KEY (space_id, event_id, participant_id)
    REFERENCES participants (space_id, event_id, id)
);

-- seq orders rows written in the same instant. method is null on CANCELLED, reason on CHECKED_IN.
-- The Idempotency-Key of the request that wrote the row is unique inside the event.
CREATE TABLE checkin_logs (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  checkin_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  action varchar(16) NOT NULL CHECK (action IN ('CHECKED_IN', 'CANCELLED')),
  method varchar(16) CHECK (method IN ('QR', 'MANUAL')),
  actor_user_id uuid NOT NULL REFERENCES users (id),
  reason varchar(200),
  idempotency_key varchar(100) NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT checkin_logs_shape CHECK (
    (action = 'CHECKED_IN' AND method IS NOT NULL AND reason IS NULL)
    OR (action = 'CANCELLED' AND method IS NULL)),
  CONSTRAINT checkin_logs_idempotency UNIQUE (space_id, event_id, idempotency_key),
  FOREIGN KEY (space_id, event_id, checkin_id) REFERENCES checkins (space_id, event_id, id),
  FOREIGN KEY (space_id, event_id, participant_id)
    REFERENCES participants (space_id, event_id, id)
);

CREATE INDEX checkin_logs_participant ON checkin_logs (space_id, event_id, participant_id, seq);
