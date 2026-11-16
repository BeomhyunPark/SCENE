-- One retrospective text per event (#237). Written only while the event is ENDED.
-- The body is not copied into audit_logs; the audit row carries the version only.
CREATE TABLE event_retrospectives (
  event_id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) <= 10000),
  version integer NOT NULL CHECK (version >= 1),
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
