package app.scene.event.notification;

/** Database row for {@link NotificationSummary}; {@code unreadCount} is counted up to 101. */
public record NotificationSummaryRow(Long latestSeq, int unreadCount) {}
