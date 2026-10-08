package app.scene.event.lifecycle.param;

import java.util.UUID;

/** Name-only update. Lifecycle status and version stay on the lifecycle commands. */
public final class EventNameUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final String name;

  private EventNameUpdate(UUID spaceId, UUID eventId, String name) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.name = name;
  }

  public static EventNameUpdate of(UUID spaceId, UUID eventId, String name) {
    return new EventNameUpdate(spaceId, eventId, name);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getName() {
    return name;
  }
}
