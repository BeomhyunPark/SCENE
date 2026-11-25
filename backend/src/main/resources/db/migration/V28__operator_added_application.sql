-- DEC-088 (A12 #462). An operator may add a participant directly. Its first revision keeps who
-- added it: revision 1 may now carry revised_by = 'OPERATOR' with revised_by_user_id. A
-- participant's own first submit still has neither. Later revisions are unchanged.
ALTER TABLE applications DROP CONSTRAINT applications_revision_shape;

ALTER TABLE applications
  ADD CONSTRAINT applications_revision_shape CHECK (
    (revision = 1 AND previous_application_id IS NULL
      AND (revised_by IS NULL OR revised_by = 'OPERATOR'))
    OR (revision > 1 AND previous_application_id IS NOT NULL AND revised_by IS NOT NULL));
