package app.scene.event.application;

import java.time.Instant;
import java.util.UUID;

/**
 * One item on the application list. Name is the SYSTEM NAME answer text, or null when that answer
 * is missing. Phone and CUSTOM answers stay off and are read on the detail only.
 */
public record ApplicationListItem(
    UUID applicationId, UUID formId, String status, Instant submittedAt, String name) {}
