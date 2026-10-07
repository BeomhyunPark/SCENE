package app.scene.common.permission;

import java.util.EnumSet;
import java.util.Set;

/**
 * Role to permission-set mapping. Only the approved defaults are filled in: every event role keeps
 * {@link Permission#EVENT_READ}, and {@link Permission#TASK_WRITE} is on OWNER and MANAGER. OWNER
 * holds the whole event set. Other MANAGER and STAFF defaults stay unset until they are approved.
 */
public final class RoleDefaults {

  private RoleDefaults() {}

  public static Set<Permission> of(String eventRole) {
    if ("OWNER".equals(eventRole)) {
      return Permission.allEventKeys();
    }
    if ("MANAGER".equals(eventRole)) {
      return EnumSet.of(Permission.EVENT_READ, Permission.TASK_WRITE);
    }
    if ("STAFF".equals(eventRole)) {
      return EnumSet.of(Permission.EVENT_READ);
    }
    return EnumSet.noneOf(Permission.class);
  }
}
