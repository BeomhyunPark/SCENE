package app.scene.space.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class EventOperatorKey {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID userId;

  private EventOperatorKey(UUID spaceId, UUID eventId, UUID userId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.userId = userId;
  }

  public static EventOperatorKey of(UUID spaceId, UUID eventId, UUID userId) {
    return new EventOperatorKey(spaceId, eventId, userId);
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
