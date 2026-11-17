-- Operator-side values of one submitted application (#335, DEC-075). One row per application.
-- The participant's answers stay in answers and are never changed here. The first round stores
-- only the operator memo; later operator values add nullable columns to this row and readers use
-- "the operator value when set, otherwise the answer". The memo is not copied into audit_logs.
CREATE TABLE application_operations (
  application_id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  memo text NOT NULL CHECK (char_length(memo) <= 2000),
  version integer NOT NULL CHECK (version >= 1),
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (space_id, event_id, application_id)
    REFERENCES applications (space_id, event_id, id)
);

CREATE INDEX application_operations_event ON application_operations (space_id, event_id);
