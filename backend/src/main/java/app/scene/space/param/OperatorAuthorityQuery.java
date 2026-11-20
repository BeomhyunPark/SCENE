package app.scene.space.param;

import java.util.List;
import java.util.UUID;

/** Every operator of one event with the stored override of one permission. */
public final class OperatorAuthorityQuery {

  private final UUID spaceId;
  private final UUID eventId;
  private final String permission;
  private final List<String> authorityStatuses;

  private OperatorAuthorityQuery(
      UUID spaceId, UUID eventId, String permission, List<String> authorityStatuses) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.permission = permission;
    this.authorityStatuses = authorityStatuses;
  }

  public static OperatorAuthorityQuery of(
      UUID spaceId, UUID eventId, String permission, List<String> authorityStatuses) {
    return new OperatorAuthorityQuery(spaceId, eventId, permission, authorityStatuses);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getPermission() {
    return permission;
  }

  public List<String> getAuthorityStatuses() {
    return authorityStatuses;
  }
}
