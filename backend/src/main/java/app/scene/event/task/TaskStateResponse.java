package app.scene.event.task;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * DEC-062 task state. {@code outcome} is present on a write response and omitted from a 409 body.
 */
public record TaskStateResponse(
    UUID taskId,
    String status,
    int version,
    Checklist checklist,
    UUID assigneeUserId,
    String assigneeDisplayName,
    UUID completedByUserId,
    String completedByDisplayName,
    Instant completedAt,
    Actions actions,
    String outcome) {

  public record Checklist(int done, int total, List<Item> items) {}

  public record Item(
      UUID itemId,
      String label,
      int position,
      boolean checked,
      UUID checkedByUserId,
      String checkedByDisplayName,
      Instant checkedAt) {}

  public record Actions(
      boolean canCheck, boolean canComplete, boolean canReopen, String blockedReason) {}
}
