package app.scene.event.task.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TaskStatusUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID taskId;
  private final String status;

  private TaskStatusUpdate(UUID spaceId, UUID eventId, UUID taskId, String status) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.taskId = taskId;
    this.status = status;
  }

  public static TaskStatusUpdate of(UUID spaceId, UUID eventId, UUID taskId, String status) {
    return new TaskStatusUpdate(spaceId, eventId, taskId, status);
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

  public String getStatus() {
    return status;
  }
}
