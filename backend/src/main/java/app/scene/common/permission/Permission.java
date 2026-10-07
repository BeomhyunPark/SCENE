package app.scene.common.permission;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Event-scoped permission keys from the architecture draft. Space keys and the deferred {@code
 * DATA_RETENTION_MANAGE} key are absent, so a request that names them is an unknown key. Role
 * defaults live in {@link RoleDefaults}, not in a permissions table.
 */
public enum Permission {
  EVENT_UPDATE,
  EVENT_USER_READ,
  PARTICIPANT_READ,
  PARTICIPANT_CONTACT_READ,
  PARTICIPANT_WRITE,
  FORM_WRITE,
  APPLICATION_READ,
  APPLICATION_MANAGE,
  TASK_WRITE,
  SCHEDULE_WRITE,
  NOTICE_WRITE,
  FINANCE_READ,
  FINANCE_WRITE,
  GROUP_WRITE,
  ROOM_WRITE,
  RIDE_WRITE,
  CLASS_WRITE,
  CHECKIN_WRITE,
  MISSION_WRITE,
  GUARDIAN_WRITE,
  GUARDIAN_CONTACT_READ,
  PRIVACY_LOG_READ,
  AUDIT_LOG_READ,
  DATA_EXPORT,
  EVENT_READ,
  EVENT_LIFECYCLE,
  EVENT_USER_MANAGE;

  private static final Map<String, Permission> BY_NAME =
      Arrays.stream(values())
          .collect(Collectors.toUnmodifiableMap(Permission::name, Function.identity()));

  /** Event Owner holds every registered event key. */
  public static EnumSet<Permission> allEventKeys() {
    return EnumSet.allOf(Permission.class);
  }

  public static Optional<Permission> find(String key) {
    if (key == null) {
      return Optional.empty();
    }
    return Optional.ofNullable(BY_NAME.get(key));
  }

  /** OWNER-only keys cannot be granted to anyone else. */
  public boolean ownerOnly() {
    return this == EVENT_LIFECYCLE || this == EVENT_USER_MANAGE;
  }

  /** {@code EVENT_READ} is the operator's event access. Removing an operator revokes it. */
  public boolean revocable() {
    return this != EVENT_READ;
  }
}
