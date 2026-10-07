package app.scene.common.tenant.param;

import java.util.List;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class EventAccessQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID userId;
  private final String revokedAction;
  private final String permission;
  private final List<String> authorityStatuses;

  private EventAccessQuery(
      UUID spaceId,
      UUID eventId,
      UUID userId,
      String revokedAction,
      String permission,
      List<String> authorityStatuses) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.userId = userId;
    this.revokedAction = revokedAction;
    this.permission = permission;
    this.authorityStatuses = authorityStatuses;
  }

  public static EventAccessQuery of(
      UUID spaceId,
      UUID eventId,
      UUID userId,
      String revokedAction,
      String permission,
      List<String> authorityStatuses) {
    return new EventAccessQuery(
        spaceId, eventId, userId, revokedAction, permission, authorityStatuses);
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

  public String getRevokedAction() {
    return revokedAction;
  }

  public String getPermission() {
    return permission;
  }

  public List<String> getAuthorityStatuses() {
    return authorityStatuses;
  }
}
