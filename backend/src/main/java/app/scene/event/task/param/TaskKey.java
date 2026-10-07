package app.scene.event.task.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TaskKey {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID taskId;

  private TaskKey(UUID spaceId, UUID eventId, UUID taskId) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.taskId = taskId;
  }

  public static TaskKey of(UUID spaceId, UUID eventId, UUID taskId) {
    return new TaskKey(spaceId, eventId, taskId);
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
}
