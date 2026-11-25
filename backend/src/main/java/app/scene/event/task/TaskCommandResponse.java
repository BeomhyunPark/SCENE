package app.scene.event.task;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Detail and command body: {@link TaskStateResponse} plus {@code title}. {@code outcome} is null
 * here. {@code startDate} and {@code dueDate} are optional dates (#475). A 409 body keeps the
 * progress task shape and does not add {@code title} or the dates.
 */
public record TaskCommandResponse(
    UUID taskId,
    String title,
    String status,
    int version,
    TaskStateResponse.Checklist checklist,
    UUID assigneeUserId,
    String assigneeDisplayName,
    UUID completedByUserId,
    String completedByDisplayName,
    Instant completedAt,
    TaskStateResponse.Actions actions,
    String outcome,
    LocalDate startDate,
    LocalDate dueDate) {}
