-- Space (organization) invitations (#361, DEC-076). Same contract as event_invitations (DEC-060):
-- only the token hash is stored, one PENDING per space and email, resend inserts a new row and marks
-- the old one SUPERSEDED. OWNER is never an invitation role.

CREATE TABLE space_invitations (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces (id),
  email_normalized varchar(320) NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('MEMBER', 'ADMIN')),
  token_hash varchar(128) NOT NULL UNIQUE,
  status varchar(16) NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'SUPERSEDED')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL REFERENCES users (id),
  accepted_user_id uuid REFERENCES users (id),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK ((status = 'ACCEPTED') = (accepted_user_id IS NOT NULL AND accepted_at IS NOT NULL))
);

CREATE UNIQUE INDEX space_invitations_one_pending
  ON space_invitations (space_id, email_normalized)
  WHERE status = 'PENDING';

CREATE INDEX space_invitations_space_status
  ON space_invitations (space_id, status, created_at DESC);
