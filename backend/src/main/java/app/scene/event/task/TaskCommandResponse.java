package app.scene.event.task;

import java.time.Instant;
import java.util.UUID;

/**
 * Detail and command body: {@link TaskStateResponse} plus {@code title}. {@code outcome} is null
 * here. A 409 body keeps the progress task shape and does not add {@code title}.
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
    String outcome) {}
