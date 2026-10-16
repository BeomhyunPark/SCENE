ALTER TABLE events
  ADD COLUMN start_date date,
  ADD COLUMN end_date date,
  ADD COLUMN place varchar(200),
  ADD COLUMN event_type varchar(32),
  ADD CONSTRAINT events_period_order CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT events_event_type CHECK (event_type IS NULL OR event_type IN (
  'RETREAT', 'VISION_TRIP', 'OUTREACH', 'SHORT_TERM_MISSION', 'BIBLE_SCHOOL', 'CAMP', 'WORKSHOP', 'OTHER'));
