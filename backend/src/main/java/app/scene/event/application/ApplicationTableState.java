package app.scene.event.application;

import java.time.Instant;
import java.util.UUID;

/**
 * Group and check-in of one submitted application (#308). {@code groupId} is null when unassigned;
 * {@code checkedInAt} is null when not arrived or the check-in was cancelled.
 */
public record ApplicationTableState(
    UUID applicationId,
    UUID participantId,
    UUID groupId,
    String groupName,
    boolean leader,
    Instant checkedInAt,
    int revision) {}
