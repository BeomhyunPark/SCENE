package app.scene.event.task;

import java.util.UUID;

/** List item. Checklist is the done/total summary. Item rows stay on the detail. */
public record TaskListItem(
    UUID taskId,
    String title,
    String status,
    UUID assigneeUserId,
    String assigneeDisplayName,
    Checklist checklist,
    int version) {

  public record Checklist(int done, int total) {}
}
