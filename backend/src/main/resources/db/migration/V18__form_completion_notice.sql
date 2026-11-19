-- Completion notice an operator writes on the form (#406, DEC-070 follow-up). Plain text shown to
-- the applicant after submit (fee account, contact, next steps). Null means no notice. Editable after
-- applications arrive. Line breaks are stored as LF; the service enforces the length.

ALTER TABLE forms ADD COLUMN completion_notice text;

ALTER TABLE forms
  ADD CONSTRAINT forms_completion_notice_length
  CHECK (completion_notice IS NULL OR char_length(completion_notice) BETWEEN 1 AND 1000);
