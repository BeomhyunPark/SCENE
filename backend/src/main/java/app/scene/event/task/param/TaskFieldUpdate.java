package app.scene.event.task.param;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Title, assignee, status, and dates written together. {@code versionDelta} is 0 when the write
 * does not change task state (title or dates only), and 1 when assignee or status does.
 */
public final class TaskFieldUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID taskId;
  private final String title;
  private final UUID assigneeUserId;
  private final String status;
  private final LocalDate startDate;
  private final LocalDate dueDate;
  private final int versionDelta;

  private TaskFieldUpdate(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      String title,
      UUID assigneeUserId,
      String status,
      LocalDate startDate,
      LocalDate dueDate,
      int versionDelta) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.taskId = taskId;
    this.title = title;
    this.assigneeUserId = assigneeUserId;
    this.status = status;
    this.startDate = startDate;
    this.dueDate = dueDate;
    this.versionDelta = versionDelta;
  }

  public static TaskFieldUpdate of(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      String title,
      UUID assigneeUserId,
      String status,
      LocalDate startDate,
      LocalDate dueDate,
      int versionDelta) {
    return new TaskFieldUpdate(
        spaceId, eventId, taskId, title, assigneeUserId, status, startDate, dueDate, versionDelta);
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

  public String getTitle() {
    return title;
  }

  public UUID getAssigneeUserId() {
    return assigneeUserId;
  }

  public String getStatus() {
    return status;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public int getVersionDelta() {
    return versionDelta;
  }
}
