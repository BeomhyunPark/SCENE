package app.scene.event.application;

import java.time.Instant;
import java.util.UUID;

/** One application on a list or a detail. Answers stay off this row. */
public record ApplicationRow(UUID applicationId, UUID formId, String status, Instant submittedAt) {}
