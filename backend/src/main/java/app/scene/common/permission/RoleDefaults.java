package app.scene.common.permission;

import java.util.EnumSet;
import java.util.Set;

/**
 * Role to permission-set mapping (DEC-079). Every event role keeps {@link Permission#EVENT_READ}
 * and {@link Permission#CHECKIN_WRITE} (DEC-071). MANAGER also has {@link Permission#TASK_WRITE}
 * (DEC-062), {@link Permission#SCHEDULE_WRITE} and {@link Permission#NOTICE_WRITE}. OWNER holds the
 * whole event set. Every other key reaches MANAGER and STAFF only through a personal GRANT.
 * Defaults are computed, not stored, so a change applies to existing operators of every event at
 * once.
 */
public final class RoleDefaults {

  private RoleDefaults() {}

  public static Set<Permission> of(String eventRole) {
    if ("OWNER".equals(eventRole)) {
      return Permission.allEventKeys();
    }
    if ("MANAGER".equals(eventRole)) {
      return EnumSet.of(
          Permission.EVENT_READ,
          Permission.TASK_WRITE,
          Permission.CHECKIN_WRITE,
          Permission.SCHEDULE_WRITE,
          Permission.NOTICE_WRITE);
    }
    if ("STAFF".equals(eventRole)) {
      return EnumSet.of(Permission.EVENT_READ, Permission.CHECKIN_WRITE);
    }
    return EnumSet.noneOf(Permission.class);
  }
}
