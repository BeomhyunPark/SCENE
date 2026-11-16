-- Question types, settings, and display conditions on form fields (DEC-068).
-- A form may now hold many CUSTOM fields. Existing CUSTOM fields become optional SHORT_TEXT.
-- Answer values in answers.value keep their {"text": ...} shape for text questions.

ALTER TABLE fields
  ADD COLUMN answer_type varchar(16) NOT NULL DEFAULT 'SHORT_TEXT',
  ADD COLUMN required boolean NOT NULL DEFAULT false,
  ADD COLUMN description varchar(500),
  ADD COLUMN config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN show_when jsonb,
  ADD COLUMN hidden boolean NOT NULL DEFAULT false;

-- Fill existing rows before the shape checks below are added.
UPDATE fields SET required = true WHERE kind = 'SYSTEM';
UPDATE fields
  SET config = '{"maxLength": 200, "format": "NONE", "placeholder": null}'::jsonb
  WHERE system_key = 'NAME' OR kind = 'CUSTOM';
UPDATE fields
  SET config = '{"maxLength": 50, "format": "PHONE", "placeholder": null}'::jsonb
  WHERE system_key = 'PHONE';

ALTER TABLE fields
  ADD CONSTRAINT fields_answer_type CHECK (answer_type IN (
    'SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'DROPDOWN',
    'DATE', 'DATE_RANGE', 'NUMBER', 'YES_NO')),
  ADD CONSTRAINT fields_config_object CHECK (jsonb_typeof(config) = 'object'),
  ADD CONSTRAINT fields_show_when_object CHECK (
    show_when IS NULL OR jsonb_typeof(show_when) = 'object'),
  ADD CONSTRAINT fields_system_shape CHECK (
    kind = 'CUSTOM'
    OR (answer_type = 'SHORT_TEXT' AND required AND show_when IS NULL AND NOT hidden));

DROP INDEX fields_one_custom;
