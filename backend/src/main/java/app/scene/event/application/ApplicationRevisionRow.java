package app.scene.event.application;

import java.time.Instant;
import java.util.UUID;

/**
 * One revision of a participant's application (DEC-078 §4). {@code changes} is the stored jsonb
 * array as text: changed questions with the label they had when this revision was stored.
 */
public record ApplicationRevisionRow(
    UUID applicationId,
    UUID formId,
    UUID participantId,
    int revision,
    String status,
    Instant submittedAt,
    String revisedBy,
    UUID revisedByUserId,
    String changes) {}
