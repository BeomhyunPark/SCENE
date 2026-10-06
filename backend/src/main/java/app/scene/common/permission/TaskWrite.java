package app.scene.common.permission;

/**
 * Effective {@link Permission#TASK_WRITE}. OWNER and MANAGER include it. STAFF does not. A stored
 * GRANT or REVOKE changes that, except OWNER overrides are ignored.
 */
public final class TaskWrite {

  private TaskWrite() {}

  public static boolean roleDefault(String eventRole) {
    return "OWNER".equals(eventRole) || "MANAGER".equals(eventRole);
  }

  public static boolean effective(String eventRole, String storedEffect) {
    if ("OWNER".equals(eventRole)) {
      return true;
    }
    if ("REVOKE".equals(storedEffect)) {
      return false;
    }
    if ("GRANT".equals(storedEffect)) {
      return true;
    }
    return roleDefault(eventRole);
  }
}
