package app.scene.common.permission;

import java.util.EnumSet;
import java.util.Set;

/**
 * Role to permission-set mapping (DEC-079, Follow-up 2026-11-20). OWNER holds the whole event set.
 * MANAGER holds the whole event set minus the OWNER-only keys ({@link Permission#ownerOnly()}:
 * {@link Permission#EVENT_LIFECYCLE} and {@link Permission#EVENT_USER_MANAGE}), so a key added to
 * {@link Permission} later reaches MANAGER by default too. STAFF keeps {@link
 * Permission#EVENT_READ} and {@link Permission#CHECKIN_WRITE} (DEC-071); every other key reaches
 * STAFF only through a personal GRANT. A personal REVOKE still narrows a MANAGER. Defaults are
 * computed, not stored, so a change applies to existing operators of every event at once.
 */
public final class RoleDefaults {

  private RoleDefaults() {}

  public static Set<Permission> of(String eventRole) {
    if ("OWNER".equals(eventRole)) {
      return Permission.allEventKeys();
    }
    if ("MANAGER".equals(eventRole)) {
      EnumSet<Permission> manager = Permission.allEventKeys();
      manager.removeIf(Permission::ownerOnly);
      return manager;
    }
    if ("STAFF".equals(eventRole)) {
      return EnumSet.of(Permission.EVENT_READ, Permission.CHECKIN_WRITE);
    }
    return EnumSet.noneOf(Permission.class);
  }
}
