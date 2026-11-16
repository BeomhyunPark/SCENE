package app.scene.event.form;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * Operator-side rules for question settings (DEC-068, {@code form-question-types-review.md}). Every
 * parse returns a normalized value with defaults filled in. Errors are {@code VALIDATION_FAILED}
 * with the offending {@code field}.
 */
public final class FieldRules {

  public static final int LABEL_MAX = 200;
  public static final int DESCRIPTION_MAX = 500;
  public static final int FIELDS_MAX = 100;
  static final int OPTIONS_MAX = 50;
  static final int OPTION_LABEL_MAX = 100;
  static final int GROUP_MAX = 50;
  static final int PLACEHOLDER_MAX = 100;
  static final int SHORT_TEXT_MAX = 200;
  static final int LONG_TEXT_MAX = 2000;
  static final int LONG_TEXT_DEFAULT = 1000;
  static final int UNIT_MAX = 10;
  static final int YES_NO_LABEL_MAX = 20;
  static final long NUMBER_LIMIT = 1_000_000_000L;

  public static final DateTimeFormatter DATE_TIME =
      DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm");

  private static final JsonNodeFactory NODES = JsonNodeFactory.instance;
  private static final SecureRandom RANDOM = new SecureRandom();

  private FieldRules() {}

  /** Label is required, trimmed, 1–200 characters. */
  public static String label(JsonNode node) {
    if (node == null || !node.isString()) {
      throw invalid("label");
    }
    String trimmed = node.asString().strip();
    if (trimmed.isEmpty() || trimmed.length() > LABEL_MAX) {
      throw invalid("label");
    }
    return trimmed;
  }

  /** Description is optional. Blank becomes null. */
  public static String description(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw invalid("description");
    }
    String trimmed = node.asString().strip();
    if (trimmed.length() > DESCRIPTION_MAX) {
      throw invalid("description");
    }
    return trimmed.isEmpty() ? null : trimmed;
  }

  public static AnswerType answerType(JsonNode node) {
    AnswerType type = node != null && node.isString() ? AnswerType.parse(node.asString()) : null;
    if (type == null) {
      throw invalid("answerType");
    }
    return type;
  }

  public static boolean bool(JsonNode node, String name) {
    if (node == null || !node.isBoolean()) {
      throw invalid(name);
    }
    return node.booleanValue();
  }

  /**
   * Normalizes {@code config} for {@code type}. Options with an {@code optionId} must already exist
   * in {@code previous}. New options get a fresh id. Option {@code showWhen} is checked for shape
   * here and against other fields in {@link #checkConditions}.
   */
  public static ObjectNode config(AnswerType type, JsonNode raw, FieldDefinition previous) {
    JsonNode input = raw == null || raw.isNull() ? NODES.objectNode() : raw;
    if (!input.isObject()) {
      throw invalid("config");
    }
    ObjectNode out = NODES.objectNode();
    switch (type) {
      case SHORT_TEXT -> {
        allowOnly(input, "maxLength", "format", "placeholder");
        out.put("maxLength", intIn(input.get("maxLength"), 1, SHORT_TEXT_MAX, SHORT_TEXT_MAX));
        out.put("format", oneOf(input.get("format"), "NONE", "NONE", "PHONE", "DIGITS"));
        putText(out, "placeholder", input.get("placeholder"), PLACEHOLDER_MAX);
      }
      case LONG_TEXT -> {
        allowOnly(input, "maxLength", "placeholder");
        out.put("maxLength", intIn(input.get("maxLength"), 1, LONG_TEXT_MAX, LONG_TEXT_DEFAULT));
        putText(out, "placeholder", input.get("placeholder"), PLACEHOLDER_MAX);
      }
      case SINGLE_CHOICE -> {
        allowOnly(input, "options", "allowOther", "display");
        out.set("options", options(input.get("options"), previous));
        out.put("allowOther", flag(input.get("allowOther")));
        out.put("display", oneOf(input.get("display"), "LIST", "LIST", "BUTTONS"));
      }
      case MULTI_CHOICE -> {
        allowOnly(input, "options", "allowOther", "minSelect", "maxSelect");
        ArrayNode options = options(input.get("options"), previous);
        boolean allowOther = flag(input.get("allowOther"));
        int choices = options.size() + (allowOther ? 1 : 0);
        int min = intIn(input.get("minSelect"), 0, choices, 0);
        JsonNode maxNode = input.get("maxSelect");
        out.set("options", options);
        out.put("allowOther", allowOther);
        out.put("minSelect", min);
        if (maxNode == null || maxNode.isNull()) {
          out.putNull("maxSelect");
        } else {
          int max = intIn(maxNode, 1, choices, choices);
          if (max < min) {
            throw invalid("config");
          }
          out.put("maxSelect", max);
        }
      }
      case DROPDOWN -> {
        allowOnly(input, "options");
        out.set("options", options(input.get("options"), previous));
      }
      case DATE, DATE_RANGE -> {
        allowOnly(input, "includeTime", "min", "max");
        boolean includeTime = flag(input.get("includeTime"));
        String min = temporal(input.get("min"), includeTime);
        String max = temporal(input.get("max"), includeTime);
        if (min != null && max != null && min.compareTo(max) > 0) {
          throw invalid("config");
        }
        out.put("includeTime", includeTime);
        putNullable(out, "min", min);
        putNullable(out, "max", max);
      }
      case NUMBER -> {
        allowOnly(input, "min", "max", "unit");
        Long min = number(input.get("min"));
        Long max = number(input.get("max"));
        if (min != null && max != null && min > max) {
          throw invalid("config");
        }
        if (min == null) {
          out.putNull("min");
        } else {
          out.put("min", min);
        }
        if (max == null) {
          out.putNull("max");
        } else {
          out.put("max", max);
        }
        putText(out, "unit", input.get("unit"), UNIT_MAX);
      }
      case YES_NO -> {
        allowOnly(input, "style", "yesLabel", "noLabel");
        out.put("style", oneOf(input.get("style"), "YES_NO", "YES_NO", "CONSENT"));
        putText(out, "yesLabel", input.get("yesLabel"), YES_NO_LABEL_MAX);
        putText(out, "noLabel", input.get("noLabel"), YES_NO_LABEL_MAX);
      }
      default -> throw new IllegalStateException("unhandled type " + type);
    }
    return out;
  }

  /** The settings a SYSTEM field always has. */
  public static ObjectNode systemConfig(String systemKey) {
    ObjectNode out = NODES.objectNode();
    if ("PHONE".equals(systemKey)) {
      out.put("maxLength", 50);
      out.put("format", "PHONE");
    } else {
      out.put("maxLength", SHORT_TEXT_MAX);
      out.put("format", "NONE");
    }
    out.putNull("placeholder");
    return out;
  }

  /** Shape of a question or option condition. Null means always shown. */
  public static JsonNode showWhen(JsonNode raw, String name) {
    if (raw == null || raw.isNull()) {
      return null;
    }
    if (!raw.isObject()) {
      throw invalid(name);
    }
    JsonNode fieldId = raw.get("fieldId");
    if (fieldId == null || !fieldId.isString() || uuid(fieldId.asString()) == null) {
      throw invalid(name);
    }
    ObjectNode out = NODES.objectNode();
    out.put("fieldId", uuid(fieldId.asString()).toString());
    JsonNode optionIds = raw.get("optionIds");
    JsonNode equals = raw.get("equals");
    for (String key : raw.propertyNames()) {
      if (!Set.of("fieldId", "optionIds", "equals").contains(key)) {
        throw invalid(name);
      }
    }
    if ((optionIds == null) == (equals == null)) {
      throw invalid(name);
    }
    if (optionIds != null) {
      if (!optionIds.isArray() || optionIds.isEmpty() || optionIds.size() > OPTIONS_MAX) {
        throw invalid(name);
      }
      ArrayNode ids = NODES.arrayNode();
      Set<String> seen = new HashSet<>();
      for (JsonNode id : optionIds) {
        if (!id.isString() || !seen.add(id.asString())) {
          throw invalid(name);
        }
        ids.add(id.asString());
      }
      out.set("optionIds", ids);
    } else {
      if (!equals.isBoolean()) {
        throw invalid(name);
      }
      out.put("equals", equals.booleanValue());
    }
    return out;
  }

  /**
   * Cross-field checks on the whole form after a change: a condition points at an earlier CUSTOM
   * question that can be a target, and its option ids exist there. An option's condition must point
   * before the question that holds the option.
   */
  public static void checkConditions(List<FieldDefinition> fields) {
    Map<UUID, FieldDefinition> byId = new HashMap<>();
    for (FieldDefinition field : fields) {
      byId.put(field.fieldId(), field);
    }
    for (FieldDefinition field : fields) {
      checkCondition(field, field.showWhen(), byId, "showWhen");
      for (FieldDefinition.Option option : field.options()) {
        checkCondition(field, option.showWhen(), byId, "config");
      }
    }
  }

  /** True when any question or option condition points at {@code targetId}. */
  public static boolean isConditionTarget(List<FieldDefinition> fields, UUID targetId) {
    String id = targetId.toString();
    for (FieldDefinition field : fields) {
      if (pointsAt(field.showWhen(), id)) {
        return true;
      }
      for (FieldDefinition.Option option : field.options()) {
        if (pointsAt(option.showWhen(), id)) {
          return true;
        }
      }
    }
    return false;
  }

  /** Option ids in {@code before} that {@code after} no longer lists. */
  public static boolean removesOption(FieldDefinition before, ObjectNode after) {
    Set<String> kept = new HashSet<>();
    JsonNode list = after.get("options");
    if (list != null && list.isArray()) {
      for (JsonNode option : list) {
        kept.add(option.get("optionId").asString());
      }
    }
    for (FieldDefinition.Option option : before.options()) {
      if (!kept.contains(option.optionId())) {
        return true;
      }
    }
    return false;
  }

  /** True when an option that already existed has a different condition. */
  public static boolean changesOptionCondition(FieldDefinition before, ObjectNode after) {
    Map<String, JsonNode> previous = new HashMap<>();
    for (FieldDefinition.Option option : before.options()) {
      previous.put(option.optionId(), option.showWhen());
    }
    JsonNode list = after.get("options");
    if (list == null || !list.isArray()) {
      return false;
    }
    for (JsonNode option : list) {
      String id = option.get("optionId").asString();
      if (!previous.containsKey(id)) {
        continue;
      }
      JsonNode next = option.get("showWhen");
      JsonNode was = previous.get(id);
      boolean nextEmpty = next == null || next.isNull();
      if (was == null ? !nextEmpty : !was.equals(next)) {
        return true;
      }
    }
    return false;
  }

  public static UUID uuid(String raw) {
    try {
      return UUID.fromString(raw);
    } catch (IllegalArgumentException exception) {
      return null;
    }
  }

  public static SceneException invalid(String name) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", name));
  }

  private static void checkCondition(
      FieldDefinition holder, JsonNode condition, Map<UUID, FieldDefinition> byId, String name) {
    if (condition == null) {
      return;
    }
    FieldDefinition target = byId.get(UUID.fromString(condition.get("fieldId").asString()));
    if (target == null
        || target.isSystem()
        || target.position() >= holder.position()
        || !target.answerType().isConditionTarget()) {
      throw invalid(name);
    }
    JsonNode optionIds = condition.get("optionIds");
    if (target.answerType() == AnswerType.YES_NO) {
      if (optionIds != null) {
        throw invalid(name);
      }
      return;
    }
    if (optionIds == null) {
      throw invalid(name);
    }
    for (JsonNode id : optionIds) {
      if (target.option(id.asString()) == null) {
        throw invalid(name);
      }
    }
  }

  private static boolean pointsAt(JsonNode condition, String id) {
    return condition != null && id.equals(condition.get("fieldId").asString());
  }

  private static ArrayNode options(JsonNode raw, FieldDefinition previous) {
    if (raw == null || !raw.isArray() || raw.isEmpty() || raw.size() > OPTIONS_MAX) {
      throw invalid("config");
    }
    Set<String> known = new HashSet<>();
    if (previous != null) {
      for (FieldDefinition.Option option : previous.options()) {
        known.add(option.optionId());
      }
    }
    Set<String> seen = new HashSet<>();
    ArrayNode out = NODES.arrayNode();
    for (JsonNode option : raw) {
      if (option == null || !option.isObject()) {
        throw invalid("config");
      }
      allowOnly(option, "optionId", "label", "group", "hidden", "showWhen");
      String id;
      JsonNode idNode = option.get("optionId");
      if (idNode == null || idNode.isNull()) {
        id = newOptionId(known, seen);
      } else if (idNode.isString() && known.contains(idNode.asString())) {
        id = idNode.asString();
      } else {
        throw invalid("config");
      }
      if (!seen.add(id)) {
        throw invalid("config");
      }
      ObjectNode next = NODES.objectNode();
      next.put("optionId", id);
      String label = text(option.get("label"), OPTION_LABEL_MAX, "config");
      if (label == null) {
        throw invalid("config");
      }
      next.put("label", label);
      putNullable(next, "group", text(option.get("group"), GROUP_MAX, "config"));
      next.put("hidden", flag(option.get("hidden")));
      JsonNode condition = showWhen(option.get("showWhen"), "config");
      if (condition == null) {
        next.putNull("showWhen");
      } else {
        next.set("showWhen", condition);
      }
      out.add(next);
    }
    return out;
  }

  private static String newOptionId(Set<String> known, Set<String> seen) {
    while (true) {
      byte[] bytes = new byte[4];
      RANDOM.nextBytes(bytes);
      String id = "opt_" + HexFormat.of().formatHex(bytes);
      if (!known.contains(id) && !seen.contains(id)) {
        return id;
      }
    }
  }

  private static void allowOnly(JsonNode node, String... keys) {
    Set<String> allowed = Set.of(keys);
    for (String key : node.propertyNames()) {
      if (!allowed.contains(key)) {
        throw invalid("config");
      }
    }
  }

  private static int intIn(JsonNode node, int min, int max, int fallback) {
    if (node == null || node.isNull()) {
      return fallback;
    }
    if (!node.isIntegralNumber() || node.longValue() < min || node.longValue() > max) {
      throw invalid("config");
    }
    return node.intValue();
  }

  private static Long number(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isIntegralNumber() || Math.abs(node.longValue()) > NUMBER_LIMIT) {
      throw invalid("config");
    }
    return node.longValue();
  }

  private static boolean flag(JsonNode node) {
    if (node == null || node.isNull()) {
      return false;
    }
    if (!node.isBoolean()) {
      throw invalid("config");
    }
    return node.booleanValue();
  }

  private static String oneOf(JsonNode node, String fallback, String... values) {
    if (node == null || node.isNull()) {
      return fallback;
    }
    if (node.isString()) {
      for (String value : values) {
        if (value.equals(node.asString())) {
          return value;
        }
      }
    }
    throw invalid("config");
  }

  private static String text(JsonNode node, int max, String name) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw invalid(name);
    }
    String trimmed = node.asString().strip();
    if (trimmed.length() > max) {
      throw invalid(name);
    }
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static void putText(ObjectNode out, String key, JsonNode node, int max) {
    putNullable(out, key, text(node, max, "config"));
  }

  private static void putNullable(ObjectNode out, String key, String value) {
    if (value == null) {
      out.putNull(key);
    } else {
      out.put(key, value);
    }
  }

  /** {@code YYYY-MM-DD}, or {@code YYYY-MM-DDTHH:mm} when the question includes time. */
  private static String temporal(JsonNode node, boolean includeTime) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (!node.isString()) {
      throw invalid("config");
    }
    String value = node.asString();
    try {
      if (includeTime) {
        LocalDateTime.parse(value, DATE_TIME);
      } else {
        LocalDate.parse(value);
      }
    } catch (DateTimeParseException exception) {
      throw invalid("config");
    }
    return value;
  }
}
