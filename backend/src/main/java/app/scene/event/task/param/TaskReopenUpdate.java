package app.scene.event.task.param;

import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class TaskReopenUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID taskId;
  private final int version;
  private final String doingStatus;
  private final String doneStatus;

  private TaskReopenUpdate(
      UUID spaceId, UUID eventId, UUID taskId, int version, String doingStatus, String doneStatus) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.taskId = taskId;
    this.version = version;
    this.doingStatus = doingStatus;
    this.doneStatus = doneStatus;
  }

  public static TaskReopenUpdate of(
      UUID spaceId, UUID eventId, UUID taskId, int version, String doingStatus, String doneStatus) {
    return new TaskReopenUpdate(spaceId, eventId, taskId, version, doingStatus, doneStatus);
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

  public String getDoingStatus() {
    return doingStatus;
  }

  public String getDoneStatus() {
    return doneStatus;
  }
}
