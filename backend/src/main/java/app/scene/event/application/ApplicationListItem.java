package app.scene.event.application;

import java.time.Instant;
import java.util.UUID;

/** One item on the application list. Answers, name, and phone stay off. */
public record ApplicationListItem(
    UUID applicationId, UUID formId, String status, Instant submittedAt) {}
