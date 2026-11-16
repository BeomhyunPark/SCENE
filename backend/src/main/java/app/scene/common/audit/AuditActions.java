package app.scene.common.audit;

/** Action names stored on {@code audit_logs.action}. Call sites use these constants. */
public final class AuditActions {

  public static final String EVENT_USER_PERMISSIONS_REPLACED = "EVENT_USER_PERMISSIONS_REPLACED";
  public static final String EVENT_USER_ROLE_CHANGED = "EVENT_USER_ROLE_CHANGED";
  public static final String EVENT_ACCESS_REVOKED = "EVENT_ACCESS_REVOKED";
  public static final String TASK_ASSIGNEE_CLEARED = "TASK_ASSIGNEE_CLEARED";
  public static final String EVENT_ACTIVATE = "EVENT_ACTIVATE";
  public static final String EVENT_END = "EVENT_END";
  public static final String EVENT_REOPEN = "EVENT_REOPEN";
  public static final String EVENT_ARCHIVE = "EVENT_ARCHIVE";
  public static final String EVENT_UNARCHIVE = "EVENT_UNARCHIVE";

  /** Details carry the new version only. The retrospective text is never audited. */
  public static final String EVENT_RETROSPECTIVE_UPDATED = "EVENT_RETROSPECTIVE_UPDATED";

  private AuditActions() {}
}
