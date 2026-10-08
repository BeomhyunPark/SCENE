package app.scene.event.application.param;

import java.util.UUID;

/** Applications that belong to one event. */
public final class EventApplicationKey {

  private final UUID spaceId;
  private final UUID eventId;

  private EventApplicationKey(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static EventApplicationKey of(UUID spaceId, UUID eventId) {
    return new EventApplicationKey(spaceId, eventId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }
}
