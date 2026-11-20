package app.scene.event.notification;

/** {@code POST …/notifications/read} answer (DEC-080 §7.4). */
public record UnreadCount(int unreadCount) {}
