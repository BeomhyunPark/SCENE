-- Submitted application source. Participants and access keys are not in this migration.
-- fields needs a composite unique key so answers can reference (space_id, event_id, field_id).

ALTER TABLE fields
  ADD CONSTRAINT fields_event_space UNIQUE (space_id, event_id, id);

CREATE TABLE applications (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  form_id uuid NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('SUBMITTED', 'SUPERSEDED', 'WITHDRAWN')),
  submitted_at timestamptz NOT NULL,
  CONSTRAINT applications_event_space UNIQUE (space_id, event_id, id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id),
  FOREIGN KEY (space_id, event_id, form_id) REFERENCES forms (space_id, event_id, id)
);

CREATE TABLE answers (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  application_id uuid NOT NULL,
  field_id uuid NOT NULL,
  value jsonb NOT NULL,
  FOREIGN KEY (space_id, event_id, application_id)
    REFERENCES applications (space_id, event_id, id),
  FOREIGN KEY (space_id, event_id, field_id)
    REFERENCES fields (space_id, event_id, id)
);
