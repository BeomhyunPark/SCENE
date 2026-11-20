package app.scene.event.notification;

import java.util.List;

/**
 * {@code GET …/notifications} (DEC-080 §7.4). Newest first. {@code nextBefore} is the {@code
 * before} value of the next page, or null on the last page.
 */
public record NotificationPage(List<Notification> items, int unreadCount, Long nextBefore) {}
