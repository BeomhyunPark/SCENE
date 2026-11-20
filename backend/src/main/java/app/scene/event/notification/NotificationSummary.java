package app.scene.event.notification;

/**
 * {@code updates.notifications} (DEC-080 §4): the newest {@code seq} of the recipient (0 with no
 * row) and the unread count, which stops at {@link Notifications#UNREAD_CAP}.
 */
public record NotificationSummary(long latestSeq, int unreadCount) {}
