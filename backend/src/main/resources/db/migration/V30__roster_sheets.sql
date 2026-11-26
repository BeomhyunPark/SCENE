-- Operator sheet of 참가 현황 (#507, #508). One document per event: operator-only columns, operator
-- rows under the participants, cell values and formats, and conditional format rules. Participants
-- never read it. Values are not copied into audit_logs; the audit row carries the version and the
-- number of operations only.
CREATE TABLE event_roster_sheets (
  event_id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  doc jsonb NOT NULL CHECK (octet_length(doc::text) <= 4000000),
  version integer NOT NULL CHECK (version >= 1),
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
