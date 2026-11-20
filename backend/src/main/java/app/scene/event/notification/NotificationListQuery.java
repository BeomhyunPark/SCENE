package app.scene.event.notification;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.Map;

/**
 * {@code ?before=&limit=} of {@code GET …/notifications} (DEC-080 §7.4). {@code before} is a
 * positive {@code seq} or absent (from the newest); {@code limit} is 1–50, 30 when absent. Other
 * values are {@code 400 VALIDATION_FAILED} with field {@code before} or {@code limit}.
 */
public record NotificationListQuery(Long before, int limit) {

  public static final int LIMIT_DEFAULT = 30;
  public static final int LIMIT_MAX = 50;

  public static NotificationListQuery parse(String before, String limit) {
    Long parsedBefore = null;
    if (before != null) {
      parsedBefore = number(before, "before");
      if (parsedBefore < 1) {
        throw invalid("before");
      }
    }
    int parsedLimit = LIMIT_DEFAULT;
    if (limit != null) {
      long value = number(limit, "limit");
      if (value < 1 || value > LIMIT_MAX) {
        throw invalid("limit");
      }
      parsedLimit = (int) value;
    }
    return new NotificationListQuery(parsedBefore, parsedLimit);
  }

  private static long number(String text, String field) {
    try {
      return Long.parseLong(text.strip());
    } catch (NumberFormatException e) {
      throw invalid(field);
    }
  }

  private static SceneException invalid(String field) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
  }
}
