package app.scene.event.notice;

import java.time.Instant;
import java.util.UUID;

/**
 * One notice in the participant list (notice-contract §5). No author name, no raw audience: only
 * {@code leadersOnly}.
 */
public record ParticipantNoticeItem(
    UUID noticeId,
    String title,
    String bodyPreview,
    boolean important,
    boolean pinned,
    boolean leadersOnly,
    Instant publishedAt,
    Instant editedAt,
    boolean unread) {}
