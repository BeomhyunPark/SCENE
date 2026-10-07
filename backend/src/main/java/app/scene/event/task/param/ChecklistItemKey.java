package app.scene.event.task.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class ChecklistItemKey {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID taskId;
  private final UUID itemId;

  private ChecklistItemKey(UUID spaceId, UUID eventId, UUID taskId, UUID itemId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.taskId = taskId;
    this.itemId = itemId;
  }

  public static ChecklistItemKey of(UUID spaceId, UUID eventId, UUID taskId, UUID itemId) {
    return new ChecklistItemKey(spaceId, eventId, taskId, itemId);
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public UUID getTaskId() {
    return taskId;
  }

  public UUID getItemId() {
    return itemId;
  }
}
