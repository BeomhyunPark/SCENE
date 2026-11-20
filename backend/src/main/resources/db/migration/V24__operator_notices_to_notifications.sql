-- DEC-080 §7 (I3, #436). Moves the old operator notices into the shared notification list.
-- Additive only: operator_notices stays. If a failed deploy brings the old code back, it still
-- writes there; the new code reads and writes notifications only. A later migration drops the table.
--
-- The rows were never shown to anyone (there was no read path), so they arrive read
-- (read_at = created_at) and no old notice pops up at once. Every stored kind was the space owner's
-- override of the event status. The row id is kept, so a moved notice can be traced back.
INSERT INTO notifications (
  id, space_id, event_id, recipient_kind, recipient_user_id,
  kind, target_type, target_id, title, important, count, created_at, read_at)
SELECT o.id, o.space_id, o.event_id, 'OPERATOR', o.recipient_user_id,
  'LIFECYCLE_OVERRIDE', 'EVENT', o.event_id, '행사 상태를 공간 소유자가 바꿨어요', true, 1,
  o.created_at, o.created_at
FROM operator_notices o
ORDER BY o.created_at, o.id;
