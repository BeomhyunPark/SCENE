package app.scene.space.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class PermissionEffectQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID userId;
  private final String permission;

  private PermissionEffectQuery(UUID spaceId, UUID eventId, UUID userId, String permission) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.userId = userId;
    this.permission = permission;
  }

  public static PermissionEffectQuery of(
      UUID spaceId, UUID eventId, UUID userId, String permission) {
    return new PermissionEffectQuery(spaceId, eventId, userId, permission);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getUserId() {
    return userId;
  }

  public String getPermission() {
    return permission;
  }
}
