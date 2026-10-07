package app.scene.space.param;

import java.time.Instant;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class PermissionOverrideWrite {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID userId;
  private final String permission;
  private final String effect;
  private final UUID grantedBy;
  private final Instant grantedAt;

  private PermissionOverrideWrite(
      UUID spaceId,
      UUID eventId,
      UUID userId,
      String permission,
      String effect,
      UUID grantedBy,
      Instant grantedAt) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.userId = userId;
    this.permission = permission;
    this.effect = effect;
    this.grantedBy = grantedBy;
    this.grantedAt = grantedAt;
  }

  public static PermissionOverrideWrite of(
      UUID spaceId,
      UUID eventId,
      UUID userId,
      String permission,
      String effect,
      UUID grantedBy,
      Instant grantedAt) {
    return new PermissionOverrideWrite(
        spaceId, eventId, userId, permission, effect, grantedBy, grantedAt);
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

  public String getEffect() {
    return effect;
  }

  public UUID getGrantedBy() {
    return grantedBy;
  }

  public Instant getGrantedAt() {
    return grantedAt;
  }
}
