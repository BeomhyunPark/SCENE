package app.scene.event.notification;

import java.time.Instant;
import java.util.UUID;

/** One notification as the list returns it (DEC-080 §7.1). {@code readAt} null means unread. */
public record Notification(
    UUID notificationId,
    long seq,
    String kind,
    Target target,
    String title,
    String body,
    boolean important,
    int count,
    Instant createdAt,
    Instant readAt) {

  public record Target(String type, UUID id) {}
}
