package app.scene.event.form;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.Map;
import tools.jackson.databind.JsonNode;

/**
 * The completion notice body (#406, DEC-070 follow-up). The notice is plain text: line breaks are
 * kept as LF, links stay as typed, and nothing is read as HTML. CRLF and CR become LF, leading and
 * trailing blank space is dropped, and an empty notice is stored as null.
 */
public final class CompletionNotice {

  /** Code points after normalizing, same as the database check. */
  public static final int MAX = 1000;

  private static final String FIELD = "completionNotice";

  private CompletionNotice() {}

  /** The body is {@code completionNotice} only: a string or null. */
  public static String parse(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw invalid();
    }
    for (String key : body.propertyNames()) {
      if (!FIELD.equals(key)) {
        throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", key));
      }
    }
    if (!body.has(FIELD)) {
      throw invalid();
    }
    JsonNode value = body.get(FIELD);
    if (value.isNull()) {
      return null;
    }
    if (!value.isString()) {
      throw invalid();
    }
    return normalize(value.asString());
  }

  static String normalize(String raw) {
    String text = raw.replace("\r\n", "\n").replace('\r', '\n').strip();
    if (text.isEmpty()) {
      return null;
    }
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      if (Character.isISOControl(c) && c != '\n' && c != '\t') {
        throw invalid();
      }
    }
    if (text.codePointCount(0, text.length()) > MAX) {
      throw invalid();
    }
    return text;
  }

  private static SceneException invalid() {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", FIELD));
  }
}
