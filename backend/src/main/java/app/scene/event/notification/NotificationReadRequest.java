package app.scene.event.notification;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/**
 * {@code POST …/notifications/read} body (DEC-080 §7.4), shared by the participant and operator
 * paths. Exactly one of:
 *
 * <ul>
 *   <li>{@code {"notificationIds": ["…"]}}: 1–50 ids. Ids that are not the recipient's are skipped
 *       without a sign.
 *   <li>{@code {"target": {"type": "NOTICE", "id": "…"}}}: every notification of the recipient that
 *       points there.
 *   <li>{@code {"upToSeq": 5821}}: every notification of the recipient with {@code seq} up to it.
 * </ul>
 *
 * None or more than one key, or another key, is {@code 400 VALIDATION_FAILED} (field: the key, or
 * {@code body} when no key or more than one).
 */
public record NotificationReadRequest(
    List<UUID> notificationIds, Notification.Target target, Long upToSeq) {

  public static final int IDS_MAX = 50;
  private static final List<String> KEYS = List.of("notificationIds", "target", "upToSeq");

  public static NotificationReadRequest parse(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw invalid("body");
    }
    int given = 0;
    for (String key : body.propertyNames()) {
      if (!KEYS.contains(key)) {
        throw invalid(key);
      }
      given++;
    }
    if (given != 1) {
      throw invalid("body");
    }
    if (body.has("notificationIds")) {
      return new NotificationReadRequest(ids(body.get("notificationIds")), null, null);
    }
    if (body.has("target")) {
      return new NotificationReadRequest(null, target(body.get("target")), null);
    }
    JsonNode upTo = body.get("upToSeq");
    if (upTo == null || !upTo.isIntegralNumber() || !upTo.canConvertToLong() || upTo.asLong() < 1) {
      throw invalid("upToSeq");
    }
    return new NotificationReadRequest(null, null, upTo.asLong());
  }

  private static List<UUID> ids(JsonNode node) {
    if (node == null || !node.isArray() || node.isEmpty() || node.size() > IDS_MAX) {
      throw invalid("notificationIds");
    }
    List<UUID> out = new ArrayList<>();
    for (JsonNode id : node) {
      out.add(uuid(id, "notificationIds"));
    }
    return out;
  }

  private static Notification.Target target(JsonNode node) {
    if (node == null || !node.isObject()) {
      throw invalid("target");
    }
    for (String key : node.propertyNames()) {
      if (!"type".equals(key) && !"id".equals(key)) {
        throw invalid("target");
      }
    }
    JsonNode type = node.get("type");
    if (type == null
        || !type.isString()
        || type.asString().isBlank()
        || type.asString().length() > NotificationDraft.TARGET_TYPE_MAX) {
      throw invalid("target");
    }
    return new Notification.Target(type.asString(), uuid(node.get("id"), "target"));
  }

  private static UUID uuid(JsonNode node, String field) {
    if (node == null || !node.isString()) {
      throw invalid(field);
    }
    try {
      return UUID.fromString(node.asString());
    } catch (IllegalArgumentException e) {
      throw invalid(field);
    }
  }

  private static SceneException invalid(String field) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
  }
}
