package app.scene.event.task.param;

import java.util.UUID;

/** Event-scoped task query. The event route resolves {@code spaceId} before this is built. */
public final class TaskEventKey {

  private final UUID spaceId;
  private final UUID eventId;

  private TaskEventKey(UUID spaceId, UUID eventId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
  }

  public static TaskEventKey of(UUID spaceId, UUID eventId) {
    return new TaskEventKey(spaceId, eventId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }
}
