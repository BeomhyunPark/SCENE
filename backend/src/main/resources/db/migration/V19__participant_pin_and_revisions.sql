-- DEC-078 (#399, #402). Participants come back with name + phone + a six-digit number they chose,
-- and an edit stores a new application row (revision) while the old one becomes SUPERSEDED.

-- One participant per phone in an event. phone_key is the SHA-256 hex of the phone's digits.
-- Rows stored before this rule may share a phone (rehearsal data): only the newest of each phone
-- gets the key, the others keep NULL and cannot sign in. Rehearsal data is deleted before
-- applications open.
ALTER TABLE participants
  ADD COLUMN phone_key varchar(64),
  ADD COLUMN pin_hash varchar(100),
  ADD COLUMN pin_temporary boolean NOT NULL DEFAULT false;

UPDATE participants p
SET phone_key = encode(sha256(convert_to(r.digits, 'UTF8')), 'hex')
FROM (
  SELECT id, regexp_replace(phone, '[^0-9]', '', 'g') AS digits,
         row_number() OVER (
           PARTITION BY space_id, event_id, regexp_replace(phone, '[^0-9]', '', 'g')
           ORDER BY created_at DESC, id DESC) AS rn
  FROM participants
) r
WHERE r.id = p.id AND r.rn = 1;

ALTER TABLE participants
  ADD CONSTRAINT participants_phone_key UNIQUE (space_id, event_id, phone_key);

-- Access keys are no longer issued (DEC-078 §7). The table stays as a record.
ALTER TABLE participant_sessions ALTER COLUMN participant_access_id DROP NOT NULL;

CREATE INDEX participant_sessions_participant
  ON participant_sessions (space_id, event_id, participant_id);

-- Revisions. revision 1 is the first submit. changes lists the changed questions with the label
-- they had when the revision was stored; answer values are not copied here.
ALTER TABLE applications
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  ADD COLUMN previous_application_id uuid,
  ADD COLUMN revised_by varchar(16) CHECK (revised_by IN ('PARTICIPANT', 'OPERATOR')),
  ADD COLUMN revised_by_user_id uuid REFERENCES users (id),
  ADD COLUMN changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT applications_changes_array CHECK (jsonb_typeof(changes) = 'array'),
  ADD CONSTRAINT applications_revision_shape CHECK (
    (revision = 1 AND previous_application_id IS NULL AND revised_by IS NULL
      AND revised_by_user_id IS NULL)
    OR (revision > 1 AND previous_application_id IS NOT NULL AND revised_by IS NOT NULL)),
  ADD CONSTRAINT applications_operator_revision CHECK (
    (revised_by = 'OPERATOR') = (revised_by_user_id IS NOT NULL)),
  ADD CONSTRAINT applications_previous
    FOREIGN KEY (space_id, event_id, previous_application_id)
    REFERENCES applications (space_id, event_id, id);

CREATE UNIQUE INDEX applications_one_submitted_per_participant
  ON applications (space_id, event_id, participant_id) WHERE status = 'SUBMITTED';

CREATE UNIQUE INDEX applications_participant_revision
  ON applications (space_id, event_id, participant_id, revision);

-- "신청 수정 받기" (DEC-078 §6). Separate from accepting_applications. On by default.
ALTER TABLE forms ADD COLUMN accepting_edits boolean NOT NULL DEFAULT true;
