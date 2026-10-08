-- Operator form fields. One form per event. Applications are not in this migration.

CREATE TABLE forms (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  accepting_applications boolean NOT NULL DEFAULT false,
  CONSTRAINT forms_one_per_event UNIQUE (event_id),
  CONSTRAINT forms_event_space UNIQUE (space_id, event_id, id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE TABLE fields (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  form_id uuid NOT NULL,
  kind varchar(16) NOT NULL CHECK (kind IN ('SYSTEM', 'CUSTOM')),
  system_key varchar(16) CHECK (system_key IS NULL OR system_key IN ('NAME', 'PHONE')),
  label varchar(200) NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  CONSTRAINT fields_kind_system_key CHECK (
    (kind = 'SYSTEM' AND system_key IS NOT NULL)
    OR (kind = 'CUSTOM' AND system_key IS NULL)
  ),
  FOREIGN KEY (space_id, event_id, form_id) REFERENCES forms (space_id, event_id, id)
);

CREATE UNIQUE INDEX fields_one_system_key
  ON fields (form_id, system_key)
  WHERE system_key IS NOT NULL;

CREATE UNIQUE INDEX fields_one_custom
  ON fields (form_id)
  WHERE kind = 'CUSTOM';
