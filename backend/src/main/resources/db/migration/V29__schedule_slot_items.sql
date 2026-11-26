-- Meal and worship slots fill the schedule working copy by themselves (DEC-090, C6).
-- Older server code ignores the new column and table.

-- true for an item the server put in for a form slot. With version 1 it is untouched, so the
-- server may take it out again when the slot leaves the setup (DEC-090 §5).
ALTER TABLE schedule_items
  ADD COLUMN auto_filled boolean NOT NULL DEFAULT false;

-- Slots whose item the operator deleted or unlinked. The automatic fill skips them; linking an
-- item to the slot again forgets the row (DEC-090 §4).
CREATE TABLE schedule_slot_dismissals (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  slot_id varchar(32) NOT NULL,
  dismissed_by uuid NOT NULL REFERENCES users (id),
  dismissed_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id, slot_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

-- Existing events (DEC-090 §2): every DRAFT or ACTIVE event with a period and a stored setup gets
-- an item for each setup slot no item holds yet, as a save of the setup would do now. The same
-- rule as ScheduleSlotFill: title is the MEALS option label (or 아침·점심·저녁·집회), the default
-- start time, category MEAL or WORSHIP, everyone, no end, place or description. Slot days past the
-- event period are left out, and an event stops at 300 items (ScheduleService.ITEMS_MAX). The
-- writer is the event's OWNER; an event without one is left as it is.
CREATE TEMPORARY TABLE v29_slots ON COMMIT DROP AS
WITH kinds (kind, category, word, start_time, kind_order) AS (
  VALUES
    ('breakfast', 'MEAL', '아침', TIME '08:00', 0),
    ('lunch', 'MEAL', '점심', TIME '12:00', 1),
    ('dinner', 'MEAL', '저녁', TIME '18:00', 2),
    ('worship', 'WORSHIP', '집회', TIME '19:30', 3)
),
targets AS (
  SELECT f.id AS form_id, f.space_id, f.event_id, f.setup,
         (e.end_date - e.start_date + 1) AS day_count,
         (SELECT eu.user_id FROM event_users eu
          WHERE eu.space_id = f.space_id AND eu.event_id = f.event_id AND eu.role = 'OWNER'
          ORDER BY eu.user_id LIMIT 1) AS owner_id
  FROM forms f
  JOIN events e ON e.id = f.event_id AND e.space_id = f.space_id
  WHERE f.setup IS NOT NULL
    AND e.lifecycle_status IN ('DRAFT', 'ACTIVE')
    AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
    AND jsonb_typeof(f.setup -> 'schedule') = 'array'
    AND jsonb_typeof(f.setup -> 'generatedFor' -> 'startDate') = 'string'
),
slots AS (
  SELECT t.space_id, t.event_id, t.owner_id, d.day::int AS day, k.category, k.start_time,
         k.kind_order, 'opt_d' || d.day || '_' || k.kind AS slot_id, t.form_id, k.word
  FROM targets t
  CROSS JOIN LATERAL jsonb_array_elements(t.setup -> 'schedule') WITH ORDINALITY AS d (entry, day)
  CROSS JOIN kinds k
  WHERE t.owner_id IS NOT NULL
    AND d.day <= t.day_count
    AND (d.entry -> k.kind) = 'true'::jsonb
),
labelled AS (
  SELECT s.*,
         left(coalesce(
           (SELECT o ->> 'label'
            FROM fields fd
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(fd.config -> 'options') = 'array'
                   THEN fd.config -> 'options' ELSE '[]'::jsonb END) AS o
            WHERE fd.form_id = s.form_id AND fd.preset_key = 'MEALS'
              AND o ->> 'optionId' = s.slot_id
              AND jsonb_typeof(o -> 'label') = 'string'
            LIMIT 1),
           s.word), 100) AS title
  FROM slots s
  WHERE NOT EXISTS (
    SELECT 1 FROM schedule_items si
    WHERE si.space_id = s.space_id AND si.event_id = s.event_id AND si.slot_id = s.slot_id)
)
SELECT l.*,
       row_number() OVER (PARTITION BY l.space_id, l.event_id ORDER BY l.day, l.kind_order)
         AS fill_rank,
       (SELECT count(*) FROM schedule_items si
        WHERE si.space_id = l.space_id AND si.event_id = l.event_id) AS existing_count,
       (SELECT coalesce(max(si.sort_order) + 1, 0) FROM schedule_items si
        WHERE si.space_id = l.space_id AND si.event_id = l.event_id
          AND si.day = l.day AND si.start_time = l.start_time) AS sort_order
FROM labelled l;

INSERT INTO schedule_items (
  id, space_id, event_id, day, start_time, end_time, title, place, description, category,
  audience, slot_id, sort_order, version, created_by, created_at, updated_by, updated_at,
  auto_filled)
SELECT gen_random_uuid(), s.space_id, s.event_id, s.day, s.start_time, NULL, s.title, NULL, NULL,
       s.category, '[{"type":"ALL"}]'::jsonb, s.slot_id, s.sort_order, 1, s.owner_id, now(),
       s.owner_id, now(), true
FROM v29_slots s
WHERE s.existing_count + s.fill_rank <= 300;

-- A filled event's board version goes up once, as one save would raise it.
INSERT INTO schedule_boards (space_id, event_id, version, updated_at)
SELECT DISTINCT s.space_id, s.event_id, 1, now()
FROM v29_slots s
WHERE s.existing_count + s.fill_rank <= 300
ON CONFLICT (space_id, event_id)
DO UPDATE SET version = schedule_boards.version + 1, updated_at = excluded.updated_at;
