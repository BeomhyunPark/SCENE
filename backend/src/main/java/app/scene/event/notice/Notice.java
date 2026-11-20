package app.scene.event.notice;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A notice for operators (notice-contract §1), every status and audience. */
public record Notice(
    UUID noticeId,
    String title,
    String body,
    boolean important,
    boolean pinned,
    List<AudienceEntry> audience,
    String status,
    int version,
    Instant firstPublishedAt,
    Instant publishedAt,
    Instant editedAt,
    Instant archivedAt,
    String createdByDisplayName,
    String updatedByDisplayName,
    Instant updatedAt) {

  /** One audience entry as stored ({@code {"type": "ALL"}}). */
  public record AudienceEntry(String type) {}
}
