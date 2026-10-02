-- Local fixture only. The local profile adds this folder to spring.flyway.locations.
-- dev, stg, prod, and tests stay on classpath:db/migration, so they never apply it.
-- Rows are insert-if-absent. Permission overrides are absent: MANAGER/STAFF defaults are not approved.
-- These people cannot sign in. Operator sessions are not built yet.

INSERT INTO users (id, display_name) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Local owner'),
  ('00000000-0000-4000-8000-000000000002', 'Local manager'),
  ('00000000-0000-4000-8000-000000000003', 'Local staff')
ON CONFLICT (id) DO NOTHING;

INSERT INTO spaces (id, name) VALUES
  ('00000000-0000-4000-8000-000000000010', 'Local space')
ON CONFLICT (id) DO NOTHING;

INSERT INTO members (space_id, user_id, role) VALUES
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'OWNER'),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002', 'MEMBER'),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000003', 'MEMBER')
ON CONFLICT (space_id, user_id) DO NOTHING;

INSERT INTO events (id, space_id, name, lifecycle_status) VALUES
  ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000010', 'Local event', 'DRAFT')
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_users (space_id, event_id, user_id, role) VALUES
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000001', 'OWNER'),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000002', 'MANAGER'),
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000003', 'STAFF')
ON CONFLICT (event_id, user_id) DO NOTHING;

INSERT INTO event_invitations (
  id, space_id, event_id, email_normalized, role, token_hash, status, expires_at, invited_by, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000020',
  'local-invite@example.com',
  'STAFF',
  'local-seed-not-a-token',
  'PENDING',
  timestamptz '2027-01-01T00:00:00Z',
  '00000000-0000-4000-8000-000000000001',
  timestamptz '2026-01-01T00:00:00Z',
  timestamptz '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
