package app.scene.event.audience;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Who an item (notice, schedule item) is for, stored as one {@code jsonb} value in this exact shape
 * (DEC-080 §8): {@code [{"type": "ALL"}]}. The list means a union.
 *
 * <p>Request bodies go through {@link #parse}: in January exactly one entry, {@code type} one of
 * {@link AudienceType}, no {@code ids} or other key; anything else is {@code 400 VALIDATION_FAILED}
 * with field {@code audience}. Stored values go back through {@link #read}, which never fails: an
 * unknown or broken entry keeps its raw type and {@link ParticipantAudience} treats it as visible
 * to nobody, so a value written by a newer server does not leak to participants.
 */
public record Audience(List<Entry> entries) {

  public static final String FIELD = "audience";

  /** One entry. {@code type} is the stored text; {@link #known()} is null for an unknown one. */
  public record Entry(String type) {

    public AudienceType known() {
      for (AudienceType value : AudienceType.values()) {
        if (value.name().equals(type)) {
          return value;
        }
      }
      return null;
    }
  }

  public Audience {
    entries = List.copyOf(entries);
  }

  public static Audience of(AudienceType type) {
    return new Audience(List.of(new Entry(type.name())));
  }

  /** Checks a request value. Throws {@code 400 VALIDATION_FAILED} (field {@code audience}). */
  public static Audience parse(JsonNode node) {
    if (node == null || !node.isArray() || node.size() != 1) {
      throw invalid();
    }
    JsonNode entry = node.get(0);
    if (entry == null || !entry.isObject()) {
      throw invalid();
    }
    for (String key : entry.propertyNames()) {
      if (!"type".equals(key)) {
        throw invalid();
      }
    }
    JsonNode type = entry.get("type");
    if (type == null || !type.isString()) {
      throw invalid();
    }
    Entry parsed = new Entry(type.asString());
    if (parsed.known() == null) {
      throw invalid();
    }
    return new Audience(List.of(parsed));
  }

  /** Reads a stored value. Never throws; a broken value is an audience nobody sees. */
  public static Audience read(JsonMapper json, String stored) {
    if (stored == null) {
      return new Audience(List.of());
    }
    try {
      JsonNode node = json.readTree(stored);
      List<Entry> out = new ArrayList<>();
      if (node != null && node.isArray()) {
        for (JsonNode entry : node) {
          JsonNode type = entry == null ? null : entry.get("type");
          out.add(new Entry(type != null && type.isString() ? type.asString() : ""));
        }
      }
      return new Audience(out);
    } catch (RuntimeException broken) {
      return new Audience(List.of());
    }
  }

  /** The stored text, for example {@code [{"type":"ALL"}]}. */
  public String toJson(JsonMapper json) {
    List<Map<String, String>> out = new ArrayList<>();
    for (Entry entry : entries) {
      out.add(Map.of("type", entry.type()));
    }
    return json.writeValueAsString(out);
  }

  /** Whether some participant can see it ({@code ALL} or {@code LEADERS}). */
  public boolean includesParticipants() {
    return has(AudienceType.ALL) || has(AudienceType.LEADERS);
  }

  /** Whether it is exactly {@code LEADERS} for participants (no {@code ALL}). */
  public boolean leadersOnly() {
    return has(AudienceType.LEADERS) && !has(AudienceType.ALL);
  }

  public boolean has(AudienceType type) {
    for (Entry entry : entries) {
      if (entry.known() == type) {
        return true;
      }
    }
    return false;
  }

  private static SceneException invalid() {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", FIELD));
  }
}
