-- DEC-082 (#380 D2, #434). Notices and the operator-scope notice refresh value.
-- Additive only: two new tables. Older code never reads them.

-- One row per notice. audience is the DEC-080 §8 shape ([{"type": "ALL"}]); participants are
-- filtered on read by ParticipantAudience. The pin limit (3 PUBLISHED per event) is kept by
-- locking the event row, not by an index.
CREATE TABLE notices (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  title varchar(100) NOT NULL,
  body varchar(5000) NOT NULL,
  important boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  audience jsonb NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  version integer NOT NULL CHECK (version >= 1),
  first_published_at timestamptz,
  published_at timestamptz,
  edited_at timestamptz,
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL,
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL,
  CONSTRAINT notices_published_shape CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
  CONSTRAINT notices_archived_unpinned CHECK (status <> 'ARCHIVED' OR NOT pinned),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE INDEX notices_list ON notices (space_id, event_id, status, published_at DESC);

-- Operator-scope refresh value (participant-home-contract §7.5 updates.notices): one row per
-- event, +1 on every notice write whatever the audience or status. Made on the first write; no
-- row reads as 0. Participants use participant_feed_versions.notices instead.
CREATE TABLE notice_boards (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (space_id, event_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);
