package app.scene.event.group;

import java.time.Instant;
import java.util.UUID;

/**
 * {@code POST …/groups/publish}. {@code result} is {@code PUBLISHED} or {@code ALREADY_PUBLISHED};
 * for the latter {@code publicationId} and {@code publishedAt} are the latest publication's.
 */
public record PublishResult(
    String result,
    UUID publicationId,
    Instant publishedAt,
    long boardVersion,
    long assignedCount,
    long unassignedCount,
    long changedParticipantCount) {

  static final String PUBLISHED = "PUBLISHED";
  static final String ALREADY_PUBLISHED = "ALREADY_PUBLISHED";
}
