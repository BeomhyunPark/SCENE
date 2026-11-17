package app.scene.event.application;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;

/**
 * One stored answer as the text an operator reads. This is the server copy of the original view's
 * rules ({@code frontend/src/components/answerDisplay.ts}): option ids become the current option
 * text, a grouped option shows its group first, an option hidden now keeps its text with "(숨김)",
 * {@code other} reads "기타: …", dates read {@code 2027. 1. 22.} or {@code 2027. 1. 22. 14:30} in
 * event-local time as stored, a number carries its unit, and yes/no uses the question's labels. The
 * one difference: where the view shows "답변 없음", the CSV leaves the cell empty.
 */
final class AnswerText {

  static final String HIDDEN_MARK = " (숨김)";
  static final String UNKNOWN_OPTION = "알 수 없는 보기";

  private static final Pattern LOCAL =
      Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2})(?:T(\\d{2}):(\\d{2}))?$");

  private AnswerText() {}

  /** Column title. A hidden question keeps its column with a mark (DEC-068 §6). */
  static String label(String label, boolean hidden) {
    return hidden ? label + HIDDEN_MARK : label;
  }

  static String format(String answerType, JsonNode config, JsonNode value) {
    if (value == null || !value.isObject()) {
      return "";
    }
    String type = answerType == null ? "" : answerType;
    switch (type) {
      case "SINGLE_CHOICE", "DROPDOWN" -> {
        if (value.path("optionId").isString()) {
          return optionText(config, value.get("optionId").asString());
        }
        if (value.path("other").isString()) {
          return otherText(value.get("other").asString());
        }
        return fallback(value);
      }
      case "MULTI_CHOICE" -> {
        List<String> parts = new ArrayList<>();
        JsonNode ids = value.path("optionIds");
        if (ids.isArray()) {
          for (JsonNode id : ids) {
            if (id.isString()) {
              parts.add(optionText(config, id.asString()));
            }
          }
        }
        if (value.path("other").isString()) {
          parts.add(otherText(value.get("other").asString()));
        }
        return parts.isEmpty() ? fallback(value) : String.join(", ", parts);
      }
      case "DATE" -> {
        if (value.path("date").isString()) {
          return local(value.get("date").asString());
        }
        if (value.path("dateTime").isString()) {
          return local(value.get("dateTime").asString());
        }
        return fallback(value);
      }
      case "DATE_RANGE" -> {
        if (value.path("start").isString() && value.path("end").isString()) {
          return local(value.get("start").asString()) + " ~ " + local(value.get("end").asString());
        }
        return fallback(value);
      }
      case "NUMBER" -> {
        JsonNode number = value.path("number");
        if (number.isNumber()) {
          String text = number(number);
          String unit = text(config, "unit");
          return unit == null ? text : text + " " + unit;
        }
        return fallback(value);
      }
      case "YES_NO" -> {
        if (value.path("value").isBoolean()) {
          return yesNo(config, value.get("value").booleanValue());
        }
        return fallback(value);
      }
      default -> {
        return fallback(value);
      }
    }
  }

  private static String optionText(JsonNode config, String optionId) {
    JsonNode options = config == null ? null : config.path("options");
    if (options != null && options.isArray()) {
      for (JsonNode option : options) {
        if (optionId.equals(text(option, "optionId"))) {
          String label = option.path("label").isString() ? option.get("label").asString() : "";
          String group = text(option, "group");
          String shown = group == null ? label : group + " " + label;
          boolean hidden = option.path("hidden").isBoolean() && option.get("hidden").booleanValue();
          return hidden ? shown + HIDDEN_MARK : shown;
        }
      }
    }
    return UNKNOWN_OPTION;
  }

  private static String otherText(String text) {
    return "기타: " + text;
  }

  private static String yesNo(JsonNode config, boolean yes) {
    boolean consent = "CONSENT".equals(text(config, "style"));
    if (yes) {
      String label = text(config, "yesLabel");
      return label != null ? label : consent ? "동의함" : "예";
    }
    String label = text(config, "noLabel");
    return label != null ? label : consent ? "동의 안 함" : "아니오";
  }

  /** Text answers, and any stored shape the type does not expect. */
  private static String fallback(JsonNode value) {
    JsonNode text = value.path("text");
    return text.isString() ? text.asString() : "";
  }

  /** A non-empty string at {@code key}, or null (the view's {@code ||} fallback). */
  private static String text(JsonNode node, String key) {
    if (node == null) {
      return null;
    }
    JsonNode value = node.path(key);
    if (!value.isString() || value.asString().isEmpty()) {
      return null;
    }
    return value.asString();
  }

  /** Integers read as written. A decimal drops trailing zeros, as JavaScript prints it. */
  private static String number(JsonNode number) {
    if (number.isIntegralNumber()) {
      return number.bigIntegerValue().toString();
    }
    BigDecimal decimal = number.decimalValue().stripTrailingZeros();
    return decimal.toPlainString();
  }

  private static String local(String text) {
    Matcher match = LOCAL.matcher(text);
    if (!match.matches()) {
      return text;
    }
    String date =
        match.group(1)
            + ". "
            + Integer.parseInt(match.group(2))
            + ". "
            + Integer.parseInt(match.group(3))
            + ".";
    return match.group(4) == null ? date : date + " " + match.group(4) + ":" + match.group(5);
  }
}
