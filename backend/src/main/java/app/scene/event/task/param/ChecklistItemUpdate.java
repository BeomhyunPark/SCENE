package app.scene.event.task.param;

import java.time.Instant;
import java.util.UUID;

/** Query or update values bound into one MyBatis statement. */
public final class ChecklistItemUpdate {

  private final UUID spaceId;
  private final UUID eventId;
  private final UUID taskId;
  private final UUID itemId;
  private final boolean checked;
  private final UUID checkedByUserId;
  private final Instant checkedAt;

  private ChecklistItemUpdate(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      UUID itemId,
      boolean checked,
      UUID checkedByUserId,
      Instant checkedAt) {
    this.spaceId = spaceId;
    this.eventId = eventId;
    this.taskId = taskId;
    this.itemId = itemId;
    this.checked = checked;
    this.checkedByUserId = checkedByUserId;
    this.checkedAt = checkedAt;
  }

  public static ChecklistItemUpdate of(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      UUID itemId,
      boolean checked,
      UUID checkedByUserId,
      Instant checkedAt) {
    return new ChecklistItemUpdate(
        spaceId, eventId, taskId, itemId, checked, checkedByUserId, checkedAt);
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

  public boolean getChecked() {
    return checked;
  }

  public UUID getCheckedByUserId() {
    return checkedByUserId;
  }

  public Instant getCheckedAt() {
    return checkedAt;
  }
}
