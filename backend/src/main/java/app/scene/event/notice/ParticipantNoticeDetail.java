package app.scene.event.notice;

import java.time.Instant;
import java.util.UUID;

/** Participant notice detail: the list item plus the whole {@code body}. */
public record ParticipantNoticeDetail(
    UUID noticeId,
    String title,
    String bodyPreview,
    String body,
    boolean important,
    boolean pinned,
    boolean leadersOnly,
    Instant publishedAt,
    Instant editedAt,
    boolean unread) {}
