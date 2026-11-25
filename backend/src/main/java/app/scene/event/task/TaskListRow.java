package app.scene.event.task;

import java.time.LocalDate;
import java.util.UUID;

/** One list row. Checklist counts are computed. Item rows are not loaded. */
public record TaskListRow(
    UUID taskId,
    String title,
    String status,
    int version,
    UUID assigneeUserId,
    String assigneeDisplayName,
    int done,
    int total,
    LocalDate startDate,
    LocalDate dueDate) {}
