package app.scene.event.notification;

import java.time.Instant;
import java.util.UUID;

/** One {@code notifications} row for a list. Not sent as is. */
public record NotificationRow(
    UUID id,
    long seq,
    String kind,
    String targetType,
    UUID targetId,
    String title,
    String body,
    boolean important,
    int count,
    Instant createdAt,
    Instant readAt) {

  Notification toItem() {
    return new Notification(
        id,
        seq,
        kind,
        new Notification.Target(targetType, targetId),
        title,
        body,
        important,
        count,
        createdAt,
        readAt);
  }
}
