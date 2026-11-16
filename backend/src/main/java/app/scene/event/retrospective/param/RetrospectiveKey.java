package app.scene.event.retrospective.param;

import java.util.UUID;

/** The retrospective of one event. */
public final class RetrospectiveKey {

  private final UUID spaceId;
  private final UUID eventId;

  private RetrospectiveKey(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static RetrospectiveKey of(UUID spaceId, UUID eventId) {
    return new RetrospectiveKey(spaceId, eventId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }
}
