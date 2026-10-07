package app.scene.event.lifecycle.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class EventStatusUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final int expectedVersion;
  private final String status;

  private EventStatusUpdate(UUID spaceId, UUID eventId, int expectedVersion, String status) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.expectedVersion = expectedVersion;
    this.status = status;
  }

  public static EventStatusUpdate of(
      UUID spaceId, UUID eventId, int expectedVersion, String status) {
    return new EventStatusUpdate(spaceId, eventId, expectedVersion, status);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public int getExpectedVersion() {
    return expectedVersion;
  }

  public String getStatus() {
    return status;
  }
}
