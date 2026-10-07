package app.scene.common.permission;

/**
 * Effective {@link Permission#TASK_WRITE}. OWNER and MANAGER include it. STAFF does not. A stored
 * GRANT or REVOKE changes that, except an active OWNER's stored override is ignored. An OWNER whose
 * handover has ended keeps the permission only through GRANT.
 */
public final class TaskWrite {

  private TaskWrite() {}

  public static boolean roleDefault(String eventRole) {
    return RoleDefaults.of(eventRole).contains(Permission.TASK_WRITE);
  }

  public static boolean effective(String eventRole, String storedEffect) {
    return effective(eventRole, false, storedEffect);
  }

  /**
   * {@code ownerAuthorityEnded} is the shared expired-handover predicate. An OWNER whose handover
   * end has passed keeps no owner default. GRANT still applies. REVOKE does not.
   */
  public static boolean effective(
      String eventRole, boolean ownerAuthorityEnded, String storedEffect) {
    return PermissionEvaluator.allows(
        Permission.TASK_WRITE, eventRole, ownerAuthorityEnded, storedEffect);
  }
}
