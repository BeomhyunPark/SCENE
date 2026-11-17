package app.scene.event.group;

import java.time.Instant;

/**
 * {@code publication} of the group board. The {@code lastPublished…} values are null until the
 * first publication (#300).
 */
public record PublicationSummary(
    Instant lastPublishedAt,
    String lastPublishedByDisplayName,
    Long lastPublishedBoardVersion,
    long activeCount,
    long assignedCount,
    long unassignedCount,
    long changedParticipantCount,
    long groupChanges,
    boolean hasUnpublishedChanges) {}
