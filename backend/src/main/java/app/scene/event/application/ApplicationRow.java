package app.scene.event.application;

import java.time.Instant;
import java.util.UUID;

/**
 * One application on a list or a detail. On the list, name is the SYSTEM NAME answer text, or null
 * when that answer is missing. The detail read leaves name null and returns answers instead.
 */
public record ApplicationRow(
    UUID applicationId, UUID formId, String status, Instant submittedAt, String name) {}
