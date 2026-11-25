package app.scene.event.task.param;

import java.time.LocalDate;
import java.util.UUID;

/** Values for one new task row. Status and version are fixed in the statement. */
public final class TaskInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final String title;
  private final UUID assigneeUserId;
  private final LocalDate startDate;
  private final LocalDate dueDate;

  private TaskInsert(
      UUID id,
      UUID spaceId,
      UUID eventId,
      String title,
      UUID assigneeUserId,
      LocalDate startDate,
      LocalDate dueDate) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.title = title;
    this.assigneeUserId = assigneeUserId;
    this.startDate = startDate;
    this.dueDate = dueDate;
  }

  public static TaskInsert of(
      UUID id,
      UUID spaceId,
      UUID eventId,
      String title,
      UUID assigneeUserId,
      LocalDate startDate,
      LocalDate dueDate) {
    return new TaskInsert(id, spaceId, eventId, title, assigneeUserId, startDate, dueDate);
  }

  public UUID getId() {
    return id;
  }

  public UUID getSpaceId() {
    return spaceId;
  }

  public UUID getEventId() {
    return eventId;
  }

  public String getTitle() {
    return title;
  }

  public UUID getAssigneeUserId() {
    return assigneeUserId;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }
}
