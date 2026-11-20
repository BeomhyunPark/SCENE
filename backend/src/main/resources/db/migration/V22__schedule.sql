-- Schedule working copy and publication snapshots (#435, DEC-081, api.md "일정표").
-- Adds tables only; older server code ignores them.

-- One row per event, written on the first change. boardVersion is 0 until then.
CREATE TABLE schedule_boards (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

-- Working-copy items. day is the stored key; the date is computed from the event start date.
-- start_time and end_time are local times in the event zone (Asia/Seoul); an end before the start
-- ends on the next day. audience is the DEC-080 §8 shape, e.g. [{"type":"ALL"}].
CREATE TABLE schedule_items (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  day smallint NOT NULL CHECK (day >= 1),
  start_time time NOT NULL,
  end_time time,
  title varchar(100) NOT NULL,
  place varchar(100),
  description varchar(2000),
  category varchar(16) NOT NULL
    CHECK (category IN ('WORSHIP', 'MEAL', 'PROGRAM', 'GROUP', 'FREE', 'MOVE', 'OTHER')),
  audience jsonb NOT NULL,
  slot_id varchar(32),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  version integer NOT NULL CHECK (version >= 1),
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL,
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  CONSTRAINT schedule_items_end CHECK (end_time IS NULL OR end_time <> start_time),
  CONSTRAINT schedule_items_slot UNIQUE (space_id, event_id, slot_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE INDEX schedule_items_order
  ON schedule_items (space_id, event_id, day, start_time, sort_order);

-- One row per publication; the latest by seq is what participants read. No personal data, so the
-- snapshot holds every item's content with its change mark, and the recently removed items:
-- {"items":[{itemId, day, startTime, endTime, title, place, description, category, audience,
--   slotId, sortOrder, change}], "removedItems":[{itemId, day, title, startTime, audience,
--   removedAt}]}. changes holds the publication's added/changed/removed summary.
CREATE TABLE schedule_publications (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  board_version bigint NOT NULL CHECK (board_version >= 0),
  snapshot jsonb NOT NULL,
  changes jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES users (id),
  published_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE INDEX schedule_publications_latest
  ON schedule_publications (space_id, event_id, seq DESC);
