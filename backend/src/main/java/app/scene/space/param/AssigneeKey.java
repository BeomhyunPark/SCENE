package app.scene.space.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class AssigneeKey {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID userId;

  private AssigneeKey(UUID spaceId, UUID eventId, UUID userId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.userId = userId;
  }

  public static AssigneeKey of(UUID spaceId, UUID eventId, UUID userId) {
    return new AssigneeKey(spaceId, eventId, userId);
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
}
