-- V1 baseline. Shared databases have not applied this migration yet.
-- Covers DEC-060 operator/invitation storage, DEC-062 tasks, and DEC-063 lifecycle.

CREATE TABLE users (
  id uuid PRIMARY KEY,
  display_name varchar(200) NOT NULL
);

CREATE TABLE spaces (
  id uuid PRIMARY KEY,
  name varchar(200) NOT NULL
);

CREATE TABLE members (
  space_id uuid NOT NULL REFERENCES spaces (id),
  user_id uuid NOT NULL REFERENCES users (id),
  role varchar(16) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LEFT')),
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE events (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces (id),
  name varchar(200) NOT NULL,
  lifecycle_status varchar(16) NOT NULL CHECK (lifecycle_status IN ('DRAFT', 'ACTIVE', 'ENDED', 'ARCHIVED')),
  lifecycle_version integer NOT NULL DEFAULT 0 CHECK (lifecycle_version >= 0),
  UNIQUE (id, space_id)
);

CREATE TABLE event_users (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id),
  role varchar(16) NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'STAFF')),
  PRIMARY KEY (event_id, user_id),
  UNIQUE (space_id, event_id, user_id),
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE TABLE event_user_permissions (
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission varchar(64) NOT NULL,
  effect varchar(8) NOT NULL CHECK (effect IN ('GRANT', 'REVOKE')),
  granted_by uuid NOT NULL REFERENCES users (id),
  granted_at timestamptz NOT NULL,
  PRIMARY KEY (event_id, user_id, permission),
  FOREIGN KEY (space_id, event_id, user_id) REFERENCES event_users (space_id, event_id, user_id) ON DELETE CASCADE
);

CREATE TABLE event_invitations (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  email_normalized varchar(320) NOT NULL,
  role varchar(16) NOT NULL CHECK (role IN ('MANAGER', 'STAFF')),
  token_hash varchar(128) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'SUPERSEDED')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL REFERENCES users (id),
  accepted_user_id uuid REFERENCES users (id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE UNIQUE INDEX event_invitations_one_pending
  ON event_invitations (event_id, email_normalized)
  WHERE status = 'PENDING';

CREATE TABLE event_lifecycle_transitions (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  command varchar(16) NOT NULL CHECK (command IN ('ACTIVATE', 'END', 'REOPEN', 'ARCHIVE', 'UNARCHIVE')),
  from_status varchar(16) NOT NULL,
  to_status varchar(16) NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users (id),
  acted_as varchar(32) NOT NULL CHECK (acted_as IN ('EVENT_OWNER', 'SPACE_OWNER', 'SPACE_OWNER_OVERRIDE')),
  reason varchar(500),
  warnings_snapshot jsonb,
  occurred_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE TABLE operator_notices (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES users (id),
  kind varchar(64) NOT NULL,
  created_at timestamptz NOT NULL,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE TABLE owner_transfers (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid,
  from_user_id uuid NOT NULL REFERENCES users (id),
  to_user_id uuid NOT NULL REFERENCES users (id),
  status varchar(16) NOT NULL CHECK (status IN ('PENDING', 'HANDOVER', 'DECLINED', 'CANCELLED', 'COMPLETED')),
  recipient_prior_role varchar(16),
  accepted_at timestamptz,
  handover_ends_at timestamptz,
  permission_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id)
);

CREATE UNIQUE INDEX owner_transfers_one_pending
  ON owner_transfers (space_id, event_id, from_user_id)
  WHERE status = 'PENDING' AND event_id IS NOT NULL;

CREATE TABLE tasks (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  title varchar(200) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('TODO', 'DOING', 'DONE', 'CANCELLED')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  assignee_user_id uuid,
  completed_by_user_id uuid REFERENCES users (id),
  completed_at timestamptz,
  FOREIGN KEY (event_id, space_id) REFERENCES events (id, space_id),
  -- No ON DELETE. Leave and operator removal clear the assignee before deleting event_users.
  FOREIGN KEY (space_id, event_id, assignee_user_id)
    REFERENCES event_users (space_id, event_id, user_id),
  UNIQUE (space_id, event_id, id)
);

CREATE TABLE task_checklist_items (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL,
  event_id uuid NOT NULL,
  task_id uuid NOT NULL,
  label varchar(200) NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  position integer NOT NULL,
  checked_by_user_id uuid REFERENCES users (id),
  checked_at timestamptz,
  FOREIGN KEY (space_id, event_id, task_id) REFERENCES tasks (space_id, event_id, id)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  space_id uuid,
  event_id uuid,
  actor_user_id uuid NOT NULL REFERENCES users (id),
  action varchar(64) NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);
