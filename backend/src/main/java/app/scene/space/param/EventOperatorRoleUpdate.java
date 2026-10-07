package app.scene.space.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class EventOperatorRoleUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID userId;
  private final String role;

  private EventOperatorRoleUpdate(UUID spaceId, UUID eventId, UUID userId, String role) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.userId = userId;
    this.role = role;
  }

  public static EventOperatorRoleUpdate of(UUID spaceId, UUID eventId, UUID userId, String role) {
    return new EventOperatorRoleUpdate(spaceId, eventId, userId, role);
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

  public String getRole() {
    return role;
  }
}
