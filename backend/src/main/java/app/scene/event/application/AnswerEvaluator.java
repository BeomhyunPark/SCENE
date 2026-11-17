package app.scene.event.application;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.form.FieldDefinition;
import app.scene.event.form.FieldRules;
import app.scene.event.form.MealSlots;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * Checks one public submission against the form (DEC-068 §3–4 §4–5). Conditions are recalculated
 * from the submitted answers in position order. Answers to hidden questions and hidden options are
 * dropped, not rejected. Every other problem is {@code APPLICATION_VALIDATION_FAILED}.
 */
public final class AnswerEvaluator {

  static final int OTHER_MAX = 200;
  static final int PHONE_DIGITS_MIN = 4;
  static final int COHORT_DIGITS = 2;
  private static final String COHORT = "COHORT";
  private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

  private AnswerEvaluator() {}

  /** One stored answer: the field and its normalized value. */
  public record Answer(UUID fieldId, String systemKey, ObjectNode value) {

    public String text() {
      return value.get("text").asString();
    }
  }

  /** Reads {@code {"answers": [...]}} and returns the answers to store, in position order. */
  public static List<Answer> evaluate(JsonNode body, List<FieldDefinition> fields) {
    Map<UUID, JsonNode> submitted = read(body);
    Map<UUID, ObjectNode> kept = new LinkedHashMap<>();
    List<Answer> answers = new ArrayList<>();
    for (FieldDefinition field : fields) {
      JsonNode raw = submitted.remove(field.fieldId());
      if (field.hidden() || !holds(field.showWhen(), kept)) {
        continue;
      }
      ObjectNode value = raw == null ? null : normalize(field, raw, kept);
      if (value == null) {
        if (field.required()) {
          throw invalid();
        }
        continue;
      }
      kept.put(field.fieldId(), value);
      answers.add(new Answer(field.fieldId(), field.systemKey(), value));
    }
    if (!submitted.isEmpty()) {
      throw invalid();
    }
    checkRange(fields, kept);
    return answers;
  }

  /** DEC-074: the departure slot may not come before the arrival slot. The same slot is fine. */
  private static void checkRange(List<FieldDefinition> fields, Map<UUID, ObjectNode> kept) {
    String arrival = null;
    String departure = null;
    for (FieldDefinition field : fields) {
      ObjectNode value = kept.get(field.fieldId());
      if (value == null || !value.path("optionId").isString()) {
        continue;
      }
      if ("ARRIVAL_SLOT".equals(field.presetKey())) {
        arrival = value.get("optionId").asString();
      } else if ("DEPARTURE_SLOT".equals(field.presetKey())) {
        departure = value.get("optionId").asString();
      }
    }
    if (arrival != null
        && departure != null
        && MealSlots.order(departure) < MealSlots.order(arrival)) {
      throw invalid();
    }
  }

  /** Each item is {@code fieldId} with either {@code text} (text questions) or {@code value}. */
  private static Map<UUID, JsonNode> read(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw invalid();
    }
    for (String key : body.propertyNames()) {
      if (!"answers".equals(key)) {
        throw invalid();
      }
    }
    JsonNode answers = body.get("answers");
    if (answers == null || !answers.isArray()) {
      throw invalid();
    }
    Map<UUID, JsonNode> submitted = new LinkedHashMap<>();
    for (JsonNode answer : answers) {
      if (answer == null || !answer.isObject() || answer.size() != 2) {
        throw invalid();
      }
      JsonNode fieldId = answer.get("fieldId");
      JsonNode text = answer.get("text");
      JsonNode value = answer.get("value");
      if (fieldId == null || !fieldId.isString() || (text == null) == (value == null)) {
        throw invalid();
      }
      UUID id = FieldRules.uuid(fieldId.asString());
      if (id == null) {
        throw invalid();
      }
      JsonNode normalized = value;
      if (text != null) {
        if (!text.isString()) {
          throw invalid();
        }
        ObjectNode wrapped = NODES.objectNode();
        wrapped.put("text", text.asString());
        normalized = wrapped;
      }
      if (!normalized.isObject() || submitted.put(id, normalized) != null) {
        throw invalid();
      }
    }
    return submitted;
  }

  /** Null means "no answer": blank text, or every chosen option is hidden. */
  private static ObjectNode normalize(
      FieldDefinition field, JsonNode raw, Map<UUID, ObjectNode> kept) {
    ObjectNode config = field.config();
    return switch (field.answerType()) {
      case SHORT_TEXT, LONG_TEXT -> text(field, raw, config);
      case SINGLE_CHOICE, DROPDOWN -> single(field, raw, kept);
      case MULTI_CHOICE -> multi(field, raw, kept);
      case DATE -> date(raw, config);
      case DATE_RANGE -> range(raw, config);
      case NUMBER -> number(raw, config);
      case YES_NO -> yesNo(field, raw);
    };
  }

  private static ObjectNode text(FieldDefinition field, JsonNode raw, ObjectNode config) {
    only(raw, "text");
    JsonNode node = raw.get("text");
    if (node == null || !node.isString()) {
      throw invalid();
    }
    String text = node.asString().strip();
    if (text.isEmpty()) {
      return null;
    }
    if (text.length() > config.get("maxLength").intValue()) {
      throw invalid();
    }
    JsonNode format = config.get("format");
    String digits = digits(text);
    if (format != null && "PHONE".equals(format.asString()) && digits.length() < PHONE_DIGITS_MIN) {
      throw invalid();
    }
    if (format != null && "DIGITS".equals(format.asString()) && digits.length() != text.length()) {
      throw invalid();
    }
    // 또래 is the last two digits of the birth year, 00–99 (DEC-070).
    if (COHORT.equals(field.systemKey()) && digits.length() != COHORT_DIGITS) {
      throw invalid();
    }
    ObjectNode out = NODES.objectNode();
    out.put("text", text);
    return out;
  }

  private static ObjectNode single(
      FieldDefinition field, JsonNode raw, Map<UUID, ObjectNode> kept) {
    if (raw.size() != 1) {
      throw invalid();
    }
    JsonNode optionId = raw.get("optionId");
    JsonNode other = raw.get("other");
    ObjectNode out = NODES.objectNode();
    if (optionId != null) {
      if (!optionId.isString()) {
        throw invalid();
      }
      FieldDefinition.Option option = field.option(optionId.asString());
      if (option == null) {
        throw invalid();
      }
      if (!visible(option, kept)) {
        return null;
      }
      out.put("optionId", option.optionId());
      return out;
    }
    String text = other(field, other);
    if (text == null) {
      return null;
    }
    out.put("other", text);
    return out;
  }

  private static ObjectNode multi(FieldDefinition field, JsonNode raw, Map<UUID, ObjectNode> kept) {
    for (String key : raw.propertyNames()) {
      if (!"optionIds".equals(key) && !"other".equals(key)) {
        throw invalid();
      }
    }
    JsonNode ids = raw.get("optionIds");
    if (ids == null || !ids.isArray()) {
      throw invalid();
    }
    ArrayNode chosen = NODES.arrayNode();
    Set<String> seen = new HashSet<>();
    for (JsonNode id : ids) {
      if (!id.isString() || !seen.add(id.asString())) {
        throw invalid();
      }
      FieldDefinition.Option option = field.option(id.asString());
      if (option == null) {
        throw invalid();
      }
      if (visible(option, kept)) {
        chosen.add(option.optionId());
      }
    }
    String other = raw.has("other") ? other(field, raw.get("other")) : null;
    int count = chosen.size() + (other == null ? 0 : 1);
    if (count == 0) {
      return null;
    }
    ObjectNode config = field.config();
    JsonNode max = config.get("maxSelect");
    if (count < config.get("minSelect").intValue()
        || (max != null && !max.isNull() && count > max.intValue())) {
      throw invalid();
    }
    ObjectNode out = NODES.objectNode();
    out.set("optionIds", chosen);
    if (other != null) {
      out.put("other", other);
    }
    return out;
  }

  /** "기타(직접입력)". Allowed only when the question turns it on. Blank is no answer. */
  private static String other(FieldDefinition field, JsonNode node) {
    JsonNode allow = field.config().get("allowOther");
    if (node == null || !node.isString() || allow == null || !allow.booleanValue()) {
      throw invalid();
    }
    String text = node.asString().strip();
    if (text.length() > OTHER_MAX) {
      throw invalid();
    }
    return text.isEmpty() ? null : text;
  }

  private static ObjectNode date(JsonNode raw, ObjectNode config) {
    String key = config.get("includeTime").booleanValue() ? "dateTime" : "date";
    only(raw, key);
    String value = temporal(raw.get(key), config);
    ObjectNode out = NODES.objectNode();
    out.put(key, value);
    return out;
  }

  private static ObjectNode range(JsonNode raw, ObjectNode config) {
    only(raw, "start", "end");
    String start = temporal(raw.get("start"), config);
    String end = temporal(raw.get("end"), config);
    if (start.compareTo(end) > 0) {
      throw invalid();
    }
    ObjectNode out = NODES.objectNode();
    out.put("start", start);
    out.put("end", end);
    return out;
  }

  /** Fixed-width ISO text compares in time order, so bounds use string comparison. */
  private static String temporal(JsonNode node, ObjectNode config) {
    if (node == null || !node.isString()) {
      throw invalid();
    }
    String value = node.asString();
    try {
      if (config.get("includeTime").booleanValue()) {
        LocalDateTime.parse(value, FieldRules.DATE_TIME);
      } else {
        LocalDate.parse(value);
      }
    } catch (DateTimeParseException exception) {
      throw invalid();
    }
    JsonNode min = config.get("min");
    JsonNode max = config.get("max");
    if ((min != null && !min.isNull() && value.compareTo(min.asString()) < 0)
        || (max != null && !max.isNull() && value.compareTo(max.asString()) > 0)) {
      throw invalid();
    }
    return value;
  }

  private static ObjectNode number(JsonNode raw, ObjectNode config) {
    only(raw, "number");
    JsonNode node = raw.get("number");
    if (node == null || !node.isIntegralNumber()) {
      throw invalid();
    }
    long value = node.longValue();
    JsonNode min = config.get("min");
    JsonNode max = config.get("max");
    if (Math.abs(value) > 1_000_000_000L
        || (min != null && !min.isNull() && value < min.longValue())
        || (max != null && !max.isNull() && value > max.longValue())) {
      throw invalid();
    }
    ObjectNode out = NODES.objectNode();
    out.put("number", value);
    return out;
  }

  /** A required consent question must be checked. */
  private static ObjectNode yesNo(FieldDefinition field, JsonNode raw) {
    only(raw, "value");
    JsonNode node = raw.get("value");
    if (node == null || !node.isBoolean()) {
      throw invalid();
    }
    boolean value = node.booleanValue();
    JsonNode style = field.config().get("style");
    if (!value && field.required() && style != null && "CONSENT".equals(style.asString())) {
      throw invalid();
    }
    ObjectNode out = NODES.objectNode();
    out.put("value", value);
    return out;
  }

  private static boolean visible(FieldDefinition.Option option, Map<UUID, ObjectNode> kept) {
    return !option.hidden() && holds(option.showWhen(), kept);
  }

  /** A target that is hidden or unanswered is not in {@code kept}, so the condition is false. */
  static boolean holds(JsonNode condition, Map<UUID, ObjectNode> kept) {
    if (condition == null) {
      return true;
    }
    for (JsonNode clause : FieldRules.clauses(condition)) {
      if (clauseHolds(clause, kept)) {
        return true;
      }
    }
    return false;
  }

  private static boolean clauseHolds(JsonNode condition, Map<UUID, ObjectNode> kept) {
    ObjectNode answer = kept.get(UUID.fromString(condition.get("fieldId").asString()));
    if (answer == null) {
      return false;
    }
    JsonNode equals = condition.get("equals");
    if (equals != null) {
      JsonNode value = answer.get("value");
      return value != null && value.booleanValue() == equals.booleanValue();
    }
    Set<String> wanted = new HashSet<>();
    for (JsonNode id : condition.get("optionIds")) {
      wanted.add(id.asString());
    }
    JsonNode single = answer.get("optionId");
    if (single != null) {
      return wanted.contains(single.asString());
    }
    JsonNode many = answer.get("optionIds");
    if (many != null) {
      for (JsonNode id : many) {
        if (wanted.contains(id.asString())) {
          return true;
        }
      }
    }
    return false;
  }

  private static void only(JsonNode raw, String... keys) {
    if (raw.size() != keys.length) {
      throw invalid();
    }
    for (String key : keys) {
      if (!raw.has(key)) {
        throw invalid();
      }
    }
  }

  static String digits(String text) {
    StringBuilder digits = new StringBuilder();
    for (int i = 0; i < text.length(); i++) {
      char character = text.charAt(i);
      if (character >= '0' && character <= '9') {
        digits.append(character);
      }
    }
    return digits.toString();
  }

  private static SceneException invalid() {
    return new SceneException(ErrorCode.APPLICATION_VALIDATION_FAILED);
  }
}
