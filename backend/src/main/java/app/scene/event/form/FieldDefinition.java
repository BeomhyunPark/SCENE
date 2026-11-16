package app.scene.event.form;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/**
 * One stored field with its parsed settings. {@code config} is the normalized object that {@link
 * FieldRules} wrote. {@code showWhen} is null when the field always shows.
 */
public record FieldDefinition(
    UUID fieldId,
    String kind,
    String systemKey,
    String label,
    int position,
    AnswerType answerType,
    boolean required,
    String description,
    ObjectNode config,
    JsonNode showWhen,
    boolean hidden,
    String presetKey,
    ObjectNode presetState) {

  public static final String SYSTEM = "SYSTEM";
  public static final String CUSTOM = "CUSTOM";

  public static FieldDefinition from(FormFieldRow row, JsonMapper json) {
    JsonNode config = row.config() == null ? null : json.readTree(row.config());
    ObjectNode object =
        config != null && config.isObject()
            ? (ObjectNode) config
            : JsonNodeFactory.instance.objectNode();
    JsonNode showWhen = row.showWhen() == null ? null : json.readTree(row.showWhen());
    AnswerType type = AnswerType.parse(row.answerType());
    if (type == null) {
      throw new IllegalStateException("unknown answer type " + row.answerType());
    }
    return new FieldDefinition(
        row.fieldId(),
        row.kind(),
        row.systemKey(),
        row.label(),
        row.position(),
        type,
        row.required(),
        row.description(),
        object,
        showWhen == null || showWhen.isNull() ? null : showWhen,
        row.hidden(),
        row.presetKey(),
        row.presetState() == null ? null : (ObjectNode) json.readTree(row.presetState()));
  }

  /** A CUSTOM question the operator made by hand. */
  public static FieldDefinition custom(
      UUID fieldId,
      String label,
      int position,
      AnswerType answerType,
      boolean required,
      String description,
      ObjectNode config,
      JsonNode showWhen,
      boolean hidden) {
    return new FieldDefinition(
        fieldId,
        CUSTOM,
        null,
        label,
        position,
        answerType,
        required,
        description,
        config,
        showWhen,
        hidden,
        null,
        null);
  }

  /** True for a question the form setup generated (DEC-070). */
  public boolean isPreset() {
    return presetKey != null;
  }

  /** False when the setup turned this generated question off. Null for other questions. */
  public Boolean presetActive() {
    if (presetState == null) {
      return null;
    }
    JsonNode active = presetState.get("active");
    return active == null || active.booleanValue();
  }

  public boolean isSystem() {
    return SYSTEM.equals(kind);
  }

  /** Options in stored order. Empty for types without options. */
  public List<Option> options() {
    List<Option> options = new ArrayList<>();
    JsonNode list = config.get("options");
    if (list == null || !list.isArray()) {
      return options;
    }
    for (JsonNode option : list) {
      JsonNode showWhen = option.get("showWhen");
      JsonNode group = option.get("group");
      JsonNode hidden = option.get("hidden");
      options.add(
          new Option(
              option.get("optionId").asString(),
              option.get("label").asString(),
              group == null || group.isNull() ? null : group.asString(),
              hidden != null && hidden.booleanValue(),
              showWhen == null || showWhen.isNull() ? null : showWhen));
    }
    return options;
  }

  public Option option(String optionId) {
    for (Option option : options()) {
      if (option.optionId().equals(optionId)) {
        return option;
      }
    }
    return null;
  }

  public FormFieldView view() {
    return new FormFieldView(
        fieldId,
        kind,
        systemKey,
        label,
        position,
        answerType.name(),
        required,
        description,
        config,
        showWhen,
        hidden,
        presetKey,
        presetActive());
  }

  /** The public view drops hidden options. Hidden fields are dropped by the caller. */
  public FormFieldView publicView() {
    ObjectNode copy = config.deepCopy();
    JsonNode list = copy.get("options");
    if (list != null && list.isArray()) {
      var visible = JsonNodeFactory.instance.arrayNode();
      for (JsonNode option : list) {
        JsonNode hiddenNode = option.get("hidden");
        if (hiddenNode == null || !hiddenNode.booleanValue()) {
          visible.add(option);
        }
      }
      copy.set("options", visible);
    }
    return new FormFieldView(
        fieldId,
        kind,
        systemKey,
        label,
        position,
        answerType.name(),
        required,
        description,
        copy,
        showWhen,
        false,
        presetKey,
        presetKey == null ? null : Boolean.TRUE);
  }

  public FieldDefinition withPosition(int next) {
    return new FieldDefinition(
        fieldId,
        kind,
        systemKey,
        label,
        next,
        answerType,
        required,
        description,
        config,
        showWhen,
        hidden,
        presetKey,
        presetState);
  }

  /** One choice option. */
  public record Option(
      String optionId, String label, String group, boolean hidden, JsonNode showWhen) {}
}
