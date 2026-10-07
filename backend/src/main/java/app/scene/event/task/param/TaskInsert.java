package app.scene.event.task.param;

import java.util.UUID;

/** Values for one new task row. Status and version are fixed in the statement. */
public final class TaskInsert {

  private final UUID id;
  private final UUID spaceId;
  private final UUID eventId;
  private final String title;
  private final UUID assigneeUserId;

  private TaskInsert(UUID id, UUID spaceId, UUID eventId, String title, UUID assigneeUserId) {
    this.id = id;
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.title = title;
    this.assigneeUserId = assigneeUserId;
  }

  public static TaskInsert of(
      UUID id, UUID spaceId, UUID eventId, String title, UUID assigneeUserId) {
    return new TaskInsert(id, spaceId, eventId, title, assigneeUserId);
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
}
