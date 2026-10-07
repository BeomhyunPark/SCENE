package app.scene.event.lifecycle.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class EventKey {

  private final UUID spaceId;
  private final UUID eventId;

  private EventKey(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static EventKey of(UUID spaceId, UUID eventId) {
    return new EventKey(spaceId, eventId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }
}
