package app.scene.event.notification;

import java.util.Objects;
import java.util.UUID;

/**
 * What a new notification says (DEC-080 §7.1). {@code kind} is a §7.2 value such as {@code
 * NOTICE_PUBLISHED}; {@code targetType} and {@code targetId} say where the screen goes ({@code
 * NOTICE} and the notice id). {@code title} is at most 80 code points and {@code body} at most 200;
 * longer text is cut to fit so a long source title never fails a publish. Put only what every
 * recipient may see on that screen: no other participant's name, phone or answer in a participant
 * notification.
 */
public record NotificationDraft(
    String kind, String targetType, UUID targetId, String title, String body, boolean important) {

  public static final int KIND_MAX = 64;
  public static final int TARGET_TYPE_MAX = 32;
  public static final int TITLE_MAX = 80;
  public static final int BODY_MAX = 200;

  public NotificationDraft {
    Objects.requireNonNull(kind, "kind");
    Objects.requireNonNull(targetType, "targetType");
    Objects.requireNonNull(title, "title");
    if (kind.isBlank() || kind.length() > KIND_MAX) {
      throw new IllegalArgumentException("notification kind must be 1-64 characters");
    }
    if (targetType.isBlank() || targetType.length() > TARGET_TYPE_MAX) {
      throw new IllegalArgumentException("notification target type must be 1-32 characters");
    }
    title = cut(title.strip(), TITLE_MAX);
    if (title.isEmpty()) {
      throw new IllegalArgumentException("notification title is empty");
    }
    body = body == null ? null : cut(body.strip(), BODY_MAX);
    if (body != null && body.isEmpty()) {
      body = null;
    }
  }

  private static String cut(String text, int max) {
    if (text.codePointCount(0, text.length()) <= max) {
      return text;
    }
    return text.substring(0, text.offsetByCodePoints(0, max));
  }
}
