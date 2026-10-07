package app.scene.event.task.param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TaskCompleteUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID taskId;
  private final int version;
  private final UUID completedByUserId;
  private final Instant completedAt;
  private final String doneStatus;
  private final List<String> openStatuses;

  private TaskCompleteUpdate(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      int version,
      UUID completedByUserId,
      Instant completedAt,
      String doneStatus,
      List<String> openStatuses) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.taskId = taskId;
    this.version = version;
    this.completedByUserId = completedByUserId;
    this.completedAt = completedAt;
    this.doneStatus = doneStatus;
    this.openStatuses = openStatuses;
  }

  public static TaskCompleteUpdate of(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      int version,
      UUID completedByUserId,
      Instant completedAt,
      String doneStatus,
      List<String> openStatuses) {
    return new TaskCompleteUpdate(
        spaceId,
        eventId,
        taskId,
        version,
        completedByUserId,
        completedAt,
        doneStatus,
        openStatuses);
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

  public int getVersion() {
    return version;
  }

  public UUID getCompletedByUserId() {
    return completedByUserId;
  }

  public Instant getCompletedAt() {
    return completedAt;
  }

  public String getDoneStatus() {
    return doneStatus;
  }

  public List<String> getOpenStatuses() {
    return openStatuses;
  }
}
