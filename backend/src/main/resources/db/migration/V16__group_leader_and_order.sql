-- One leader per group and member order within a group (#343, DEC-072 Follow-up 2026-11-17).

-- position orders members within a group (smaller first). Existing rows get the order the board
-- showed before: leader first, then name by code point, then participant id.
ALTER TABLE group_assignments ADD COLUMN position integer;

UPDATE group_assignments ga
SET position = r.rn
FROM (
  SELECT ga2.space_id, ga2.event_id, ga2.participant_id,
         row_number() OVER (
           PARTITION BY ga2.space_id, ga2.event_id, ga2.group_id
           ORDER BY ga2.leader DESC, p.name COLLATE "C", p.id) - 1 AS rn
  FROM group_assignments ga2
  JOIN participants p
    ON p.space_id = ga2.space_id AND p.event_id = ga2.event_id AND p.id = ga2.participant_id
) r
WHERE ga.space_id = r.space_id AND ga.event_id = r.event_id AND ga.participant_id = r.participant_id;

ALTER TABLE group_assignments ALTER COLUMN position SET NOT NULL;
ALTER TABLE group_assignments ADD CONSTRAINT group_assignments_position CHECK (position >= 0);

-- A group with more than one leader keeps one: an active (SUBMITTED) leader first, then name by code
-- point, then participant id. The others lose the mark. No history row: a migration has no actor.
UPDATE group_assignments ga
SET leader = false
FROM (
  SELECT ga2.space_id, ga2.event_id, ga2.participant_id,
         row_number() OVER (
           PARTITION BY ga2.space_id, ga2.event_id, ga2.group_id
           ORDER BY EXISTS (
                      SELECT 1 FROM applications a
                      WHERE a.space_id = p.space_id AND a.event_id = p.event_id
                        AND a.participant_id = p.id AND a.status = 'SUBMITTED') DESC,
                    p.name COLLATE "C", p.id) AS rn
  FROM group_assignments ga2
  JOIN participants p
    ON p.space_id = ga2.space_id AND p.event_id = ga2.event_id AND p.id = ga2.participant_id
  WHERE ga2.leader
) r
WHERE ga.space_id = r.space_id AND ga.event_id = r.event_id AND ga.participant_id = r.participant_id
  AND r.rn > 1;

CREATE UNIQUE INDEX group_assignments_one_leader
  ON group_assignments (space_id, event_id, group_id) WHERE leader;
