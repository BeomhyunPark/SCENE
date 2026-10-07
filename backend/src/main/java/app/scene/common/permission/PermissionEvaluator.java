package app.scene.common.permission;

import java.util.EnumSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Effective permissions for one request. The result is role defaults plus GRANT minus REVOKE. It is
 * not stored on the session. An OWNER whose handover has ended keeps no owner default; a stored
 * GRANT still applies and a stored REVOKE does not. GRANT of an owner-only key does not apply to a
 * non-OWNER.
 *
 * <p>DEC-060 hides other operators' contact details from an event-only collaborator. No grant,
 * including {@link Permission#EVENT_USER_READ} and {@link Permission#PARTICIPANT_CONTACT_READ},
 * lifts that. A grant also does not skip tenant, resource ownership, export re-auth, or a privacy
 * log. Permission keys are not privacy-log subjects.
 */
public final class PermissionEvaluator {

  private PermissionEvaluator() {}

  public static Set<Permission> effective(
      String eventRole, boolean ownerAuthorityEnded, Map<Permission, String> storedEffects) {
    if ("OWNER".equals(eventRole) && ownerAuthorityEnded) {
      return grantsOnly(storedEffects);
    }
    if ("OWNER".equals(eventRole)) {
      return copyOf(RoleDefaults.of(eventRole));
    }
    EnumSet<Permission> effective = copyOf(RoleDefaults.of(eventRole));
    if (storedEffects == null || storedEffects.isEmpty()) {
      return effective;
    }
    for (Map.Entry<Permission, String> stored : storedEffects.entrySet()) {
      Permission permission = stored.getKey();
      if (permission == null) {
        continue;
      }
      if ("REVOKE".equals(stored.getValue())) {
        effective.remove(permission);
      } else if ("GRANT".equals(stored.getValue()) && !permission.ownerOnly()) {
        effective.add(permission);
      }
    }
    return effective;
  }

  public static boolean allows(
      Permission permission, String eventRole, boolean ownerAuthorityEnded, String storedEffect) {
    Map<Permission, String> effects =
        storedEffect == null ? Map.of() : Map.of(permission, storedEffect);
    return effective(eventRole, ownerAuthorityEnded, effects).contains(permission);
  }

  /**
   * Contact details of other operators. {@code effective} is accepted so a caller cannot forget the
   * set, and is ignored when the reader is an event-only collaborator.
   */
  public static boolean mayReadOtherOperatorContact(
      boolean eventOnlyCollaborator, Set<Permission> effective) {
    Objects.requireNonNull(effective, "effective");
    return !eventOnlyCollaborator;
  }

  private static EnumSet<Permission> grantsOnly(Map<Permission, String> storedEffects) {
    EnumSet<Permission> granted = EnumSet.noneOf(Permission.class);
    if (storedEffects == null) {
      return granted;
    }
    for (Map.Entry<Permission, String> stored : storedEffects.entrySet()) {
      if (stored.getKey() != null && "GRANT".equals(stored.getValue())) {
        granted.add(stored.getKey());
      }
    }
    return granted;
  }

  private static EnumSet<Permission> copyOf(Set<Permission> permissions) {
    if (permissions.isEmpty()) {
      return EnumSet.noneOf(Permission.class);
    }
    return EnumSet.copyOf(permissions);
  }
}
