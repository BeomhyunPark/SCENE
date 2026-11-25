package app.scene.event.task;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record TaskRow(
    UUID id,
    UUID eventId,
    String title,
    String status,
    int version,
    UUID assigneeUserId,
    UUID completedByUserId,
    Instant completedAt,
    String lifecycleStatus,
    LocalDate startDate,
    LocalDate dueDate) {}
