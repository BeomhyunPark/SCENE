package app.scene.space.param;

import java.util.UUID;

/** Tenant pair for an event-scoped read. */
public final class EventScope {

  private final UUID spaceId;
  private final UUID eventId;

  private EventScope(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static EventScope of(UUID spaceId, UUID eventId) {
    return new EventScope(spaceId, eventId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }
}
