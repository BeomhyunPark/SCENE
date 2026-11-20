package app.scene.event.schedule;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.audience.Audience;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * Item fields of a create or update body, shape-checked before the event row is locked
 * (schedule-contract §2). Rules that need the item or the event (day range, end equals start, slot
 * day and category) run in {@link #check} after the merge. Every failure is {@code 400
 * VALIDATION_FAILED} with the field name.
 */
final class ItemInput {

  static final int TITLE_MAX = 100;
  static final int PLACE_MAX = 100;
  static final int DESCRIPTION_MAX = 2000;
  static final int DAY_MAX = ScheduleViews.DAYS_MAX;
  static final int SORT_ORDER_MAX = 100_000;

  static final Set<String> CATEGORIES =
      Set.of("WORSHIP", "MEAL", "PROGRAM", "GROUP", "FREE", "MOVE", "OTHER");

  private static final Pattern TIME = Pattern.compile("([01][0-9]|2[0-3]):[0-5][0-9]");
  private static final Pattern SLOT =
      Pattern.compile("opt_d([1-9][0-9]{0,2})_(breakfast|lunch|dinner|worship)");

  private static final List<String> REQUIRED =
      List.of("day", "startTime", "title", "category", "audience");

  /** Present keys and their checked values; a null value clears a nullable field. */
  private final Map<String, Object> values;

  private ItemInput(Map<String, Object> values) {
    this.values = values;
  }

  /** A create body: every required field, no {@code sortOrder}. */
  static ItemInput forCreate(JsonNode body) {
    requireObject(body);
    ItemInput input = read(body, false);
    for (String field : REQUIRED) {
      if (!input.values.containsKey(field)) {
        throw invalid(field);
      }
    }
    return input;
  }

  /** An update body: only the sent fields, {@code sortOrder} allowed. */
  static ItemInput forUpdate(JsonNode body) {
    requireObject(body);
    return read(body, true);
  }

  private static ItemInput read(JsonNode body, boolean update) {
    Map<String, Object> out = new LinkedHashMap<>();
    if (body.has("day")) {
      JsonNode node = body.get("day");
      if (node == null
          || !node.isIntegralNumber()
          || !node.canConvertToInt()
          || node.asInt() < 1
          || node.asInt() > DAY_MAX) {
        throw invalid("day");
      }
      out.put("day", node.asInt());
    }
    if (body.has("startTime")) {
      out.put("startTime", time(body.get("startTime"), "startTime", false));
    }
    if (body.has("endTime")) {
      out.put("endTime", time(body.get("endTime"), "endTime", true));
    }
    if (body.has("title")) {
      String title = text(body.get("title"), "title", TITLE_MAX, false);
      if (title == null) {
        throw invalid("title");
      }
      out.put("title", title);
    }
    if (body.has("place")) {
      out.put("place", text(body.get("place"), "place", PLACE_MAX, true));
    }
    if (body.has("description")) {
      out.put("description", text(body.get("description"), "description", DESCRIPTION_MAX, true));
    }
    if (body.has("category")) {
      JsonNode node = body.get("category");
      if (node == null || !node.isString() || !CATEGORIES.contains(node.asString())) {
        throw invalid("category");
      }
      out.put("category", node.asString());
    }
    if (body.has(Audience.FIELD)) {
      out.put(Audience.FIELD, Audience.parse(body.get(Audience.FIELD)));
    }
    if (body.has("slotId")) {
      JsonNode node = body.get("slotId");
      if (node == null || node.isNull()) {
        out.put("slotId", null);
      } else if (!node.isString() || !SLOT.matcher(node.asString()).matches()) {
        throw invalid("slotId");
      } else {
        out.put("slotId", node.asString());
      }
    }
    if (update && body.has("sortOrder")) {
      JsonNode node = body.get("sortOrder");
      if (node == null
          || !node.isIntegralNumber()
          || !node.canConvertToInt()
          || node.asInt() < 0
          || node.asInt() > SORT_ORDER_MAX) {
        throw invalid("sortOrder");
      }
      out.put("sortOrder", node.asInt());
    }
    return new ItemInput(out);
  }

  boolean has(String field) {
    return values.containsKey(field);
  }

  boolean isEmpty() {
    return values.isEmpty();
  }

  /** The created content. {@code sortOrder} comes from the server. */
  ItemContent create(int sortOrder) {
    return new ItemContent(
        (Integer) values.get("day"),
        (String) values.get("startTime"),
        (String) values.get("endTime"),
        (String) values.get("title"),
        (String) values.get("place"),
        (String) values.get("description"),
        (String) values.get("category"),
        (Audience) values.get(Audience.FIELD),
        (String) values.get("slotId"),
        sortOrder);
  }

  /** {@code base} with the sent fields replaced. */
  ItemContent merge(ItemContent base) {
    return new ItemContent(
        (Integer) pick("day", base.day()),
        (String) pick("startTime", base.startTime()),
        (String) pick("endTime", base.endTime()),
        (String) pick("title", base.title()),
        (String) pick("place", base.place()),
        (String) pick("description", base.description()),
        (String) pick("category", base.category()),
        (Audience) pick(Audience.FIELD, base.audience()),
        (String) pick("slotId", base.slotId()),
        (Integer) pick("sortOrder", base.sortOrder()));
  }

  private Object pick(String field, Object current) {
    return values.containsKey(field) ? values.get(field) : current;
  }

  /**
   * Rules across fields of the merged content. {@code dayCount} is the event's day count; the day
   * range is checked only when {@code checkDay} (the day was sent), so an item left outside a
   * shortened period can still be edited and moved.
   */
  static void check(ItemContent content, int dayCount, boolean checkDay) {
    if (checkDay && content.day() > dayCount) {
      throw invalid("day");
    }
    if (content.endTime() != null && content.endTime().equals(content.startTime())) {
      throw invalid("endTime");
    }
    if (content.slotId() != null) {
      Matcher slot = SLOT.matcher(content.slotId());
      if (!slot.matches() || Integer.parseInt(slot.group(1)) != content.day()) {
        throw invalid("slotId");
      }
      String expected = "worship".equals(slot.group(2)) ? "WORSHIP" : "MEAL";
      if (!expected.equals(content.category())) {
        throw invalid("slotId");
      }
    }
  }

  private static String time(JsonNode node, String field, boolean nullable) {
    if (node == null || node.isNull()) {
      if (nullable) {
        return null;
      }
      throw invalid(field);
    }
    if (!node.isString() || !TIME.matcher(node.asString()).matches()) {
      throw invalid(field);
    }
    return node.asString();
  }

  /** Stripped text; empty is null when {@code nullable}, else invalid. */
  private static String text(JsonNode node, String field, int max, boolean nullable) {
    if (node == null || node.isNull()) {
      if (nullable) {
        return null;
      }
      throw invalid(field);
    }
    if (!node.isString()) {
      throw invalid(field);
    }
    String value = node.asString().strip();
    if (value.codePointCount(0, value.length()) > max) {
      throw invalid(field);
    }
    if (value.isEmpty()) {
      if (nullable) {
        return null;
      }
      throw invalid(field);
    }
    return value;
  }

  private static void requireObject(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw invalid("body");
    }
  }

  static SceneException invalid(String field) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", field));
  }
}
