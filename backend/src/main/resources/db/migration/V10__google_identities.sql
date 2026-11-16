-- Google sign-in (#232, DEC-069). One Google account (OIDC subject) maps to one SCENE user.
-- The email is the verified address Google returned at the last sign-in. It is used to match
-- invitations and the bootstrap owner, and is not shown on /me.

CREATE TABLE user_google_identities (
  subject varchar(255) PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users (id),
  email varchar(320) NOT NULL,
  created_at timestamptz NOT NULL,
  last_signed_in_at timestamptz NOT NULL
);
