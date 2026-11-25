package app.scene.event.task;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Fields present on one PATCH. A present assignee may be null, which clears it. A present status
 * has already been limited to {@code CANCELLED}. A present date may be null, which clears it. The
 * date range is checked after merging with the stored row.
 */
public record TaskPatch(
    boolean titlePresent,
    String title,
    boolean assigneePresent,
    UUID assigneeUserId,
    boolean statusPresent,
    String status,
    boolean startDatePresent,
    LocalDate startDate,
    boolean dueDatePresent,
    LocalDate dueDate) {}
