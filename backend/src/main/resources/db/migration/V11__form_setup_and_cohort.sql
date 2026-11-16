-- Form setup, generated questions, and the 또래 base question (DEC-070). V10 is Google identities.
-- A form keeps the operator's setup answers. Generated questions carry a fixed preset key so later
-- counts and group assignment find the answer after the operator rewords the question.

ALTER TABLE forms
  ADD COLUMN setup jsonb,
  ADD CONSTRAINT forms_setup_object CHECK (setup IS NULL OR jsonb_typeof(setup) = 'object');

ALTER TABLE fields
  ADD COLUMN preset_key varchar(32),
  ADD COLUMN preset_state jsonb,
  ADD CONSTRAINT fields_preset_custom CHECK (preset_key IS NULL OR kind = 'CUSTOM'),
  ADD CONSTRAINT fields_preset_state CHECK (
    (preset_key IS NULL AND preset_state IS NULL)
    OR (preset_key IS NOT NULL AND jsonb_typeof(preset_state) = 'object'));

CREATE UNIQUE INDEX fields_one_preset_key
  ON fields (form_id, preset_key)
  WHERE preset_key IS NOT NULL;

-- 또래 is the third SYSTEM question. It is the only SYSTEM question that can be hidden.
ALTER TABLE fields
  DROP CONSTRAINT fields_system_key_check,
  ADD CONSTRAINT fields_system_key_check CHECK (
    system_key IS NULL OR system_key IN ('NAME', 'PHONE', 'COHORT')),
  DROP CONSTRAINT fields_system_shape,
  ADD CONSTRAINT fields_system_shape CHECK (
    kind = 'CUSTOM'
    OR (answer_type = 'SHORT_TEXT' AND required AND show_when IS NULL
        AND (system_key = 'COHORT' OR NOT hidden)));

-- Existing forms get 또래 right after 전화, turned on. Nothing is deployed yet (DEC-070).
UPDATE fields f
  SET position = f.position + 1
  FROM fields p
  WHERE p.form_id = f.form_id AND p.system_key = 'PHONE' AND f.position > p.position;

INSERT INTO fields (
  id, space_id, event_id, form_id, kind, system_key, label, position,
  answer_type, required, description, config, show_when, hidden)
SELECT gen_random_uuid(), p.space_id, p.event_id, p.form_id, 'SYSTEM', 'COHORT', '또래',
  p.position + 1, 'SHORT_TEXT', true, '출생연도 뒤 두 자리를 적어주세요.',
  '{"maxLength": 2, "format": "DIGITS", "placeholder": "예: 94"}'::jsonb, NULL, false
FROM fields p
WHERE p.system_key = 'PHONE';
