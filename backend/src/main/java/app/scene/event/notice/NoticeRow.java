package app.scene.event.notice;

import java.time.Instant;
import java.util.UUID;

/** One {@code notices} row with author names. Not sent as is. {@code audience} is jsonb text. */
public record NoticeRow(
    UUID id,
    UUID spaceId,
    UUID eventId,
    String title,
    String body,
    boolean important,
    boolean pinned,
    String audience,
    String status,
    int version,
    Instant firstPublishedAt,
    Instant publishedAt,
    Instant editedAt,
    Instant archivedAt,
    String createdByDisplayName,
    String updatedByDisplayName,
    Instant updatedAt) {

  static final String DRAFT = "DRAFT";
  static final String PUBLISHED = "PUBLISHED";
  static final String ARCHIVED = "ARCHIVED";

  boolean isPublished() {
    return PUBLISHED.equals(status);
  }

  boolean isDraft() {
    return DRAFT.equals(status);
  }

  boolean isArchived() {
    return ARCHIVED.equals(status);
  }
}
