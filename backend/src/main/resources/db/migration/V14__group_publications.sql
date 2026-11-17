-- Group publication snapshots (#300, DEC-072 §1). One row per publication; the latest row by seq is
-- what participants and the operator published view read. The snapshot holds group ids, names, and
-- sort order, and per group the participant ids of members with their leader mark. Names, phones,
-- and answers are not copied here; reads attach the current values.
CREATE TABLE group_publications (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  board_version bigint NOT NULL CHECK (board_version >= 0),
  snapshot jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES users (id),
  published_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE INDEX group_publications_latest ON group_publications (space_id, event_id, seq DESC);
