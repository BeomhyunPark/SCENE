package app.scene.event.form;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Fits the stored questions to a newly generated set (DEC-070). Missing questions are added. A
 * question the setup no longer wants is removed when nothing was submitted, the operator did not
 * touch it, and no kept question points at it; otherwise it is hidden and marked inactive. Text the
 * operator changed stays. On a locked form the DEC-068 rules hold: an option is hidden instead of
 * removed, and a changed condition is {@code FIELD_LOCKED}.
 */
public final class FormSetupPlan {

  private final List<FieldDefinition> fields;
  private final Set<UUID> added;
  private final Set<UUID> removed;

  private FormSetupPlan(List<FieldDefinition> fields, Set<UUID> added, Set<UUID> removed) {
    this.fields = fields;
    this.added = added;
    this.removed = removed;
  }

  /** Every kept field in its new order, positions renumbered from 0. */
  public List<FieldDefinition> fields() {
    return fields;
  }

  /** Field ids in {@link #fields} that are not stored yet. */
  public Set<UUID> added() {
    return added;
  }

  /** Stored field ids to delete. */
  public Set<UUID> removed() {
    return removed;
  }

  public static FormSetupPlan of(
      List<FieldDefinition> current,
      List<FormPreset.Question> ideal,
      boolean locked,
      Function<String, UUID> ids) {
    Map<String, FieldDefinition> byKey = new HashMap<>();
    for (FieldDefinition field : current) {
      if (field.isPreset()) {
        byKey.put(field.presetKey(), field);
      }
    }
    Map<UUID, FieldDefinition> next = new LinkedHashMap<>();
    List<FieldDefinition> fresh = new ArrayList<>();
    Set<String> wanted = new HashSet<>();
    for (FormPreset.Question question : ideal) {
      wanted.add(question.key());
      FieldDefinition existing = byKey.get(question.key());
      if (existing == null) {
        fresh.add(created(question, ids.apply(question.key())));
      } else {
        next.put(existing.fieldId(), merged(existing, question, locked));
      }
    }

    // Questions the setup turned off. Delete what is safe to delete, hide the rest.
    Set<UUID> removable = new HashSet<>();
    for (FieldDefinition field : current) {
      if (field.isPreset() && !wanted.contains(field.presetKey())) {
        if (!locked && untouched(field)) {
          removable.add(field.fieldId());
        }
        next.put(field.fieldId(), inactive(field));
      }
    }
    boolean changed = true;
    while (changed) {
      changed = false;
      for (FieldDefinition field : current) {
        if (removable.contains(field.fieldId())) {
          continue;
        }
        FieldDefinition kept = next.getOrDefault(field.fieldId(), field);
        for (UUID target : targets(kept)) {
          changed |= removable.remove(target);
        }
      }
    }

    List<FieldDefinition> ordered = new ArrayList<>();
    for (FieldDefinition field : current) {
      if (!removable.contains(field.fieldId())) {
        ordered.add(next.getOrDefault(field.fieldId(), field));
      }
    }
    Set<UUID> added = new HashSet<>();
    for (FieldDefinition field : fresh) {
      ordered.add(insertIndex(ordered, field), field);
      added.add(field.fieldId());
    }
    List<FieldDefinition> numbered = renumber(ordered);
    if (!valid(numbered)) {
      numbered = renumber(canonical(ordered));
      if (!valid(numbered)) {
        // A hand-made question depends on something this setup takes away.
        throw new SceneException(ErrorCode.CONFLICT);
      }
    }
    return new FormSetupPlan(numbered, added, removable);
  }

  /** True when the operator left every generated text and the required switch as generated. */
  static boolean untouched(FieldDefinition field) {
    ObjectNode state = field.presetState();
    if (!Objects.equals(field.label(), text(state.get("label")))
        || !Objects.equals(field.description(), text(state.get("description")))
        || field.required() != state.get("required").booleanValue()
        || !Objects.equals(
            text(field.config().get("placeholder")), text(state.get("placeholder")))) {
      return false;
    }
    JsonNode labels = state.get("options");
    for (FieldDefinition.Option option : field.options()) {
      JsonNode label = labels.get(option.optionId());
      if (label != null && !label.asString().equals(option.label())) {
        return false;
      }
    }
    return true;
  }

  private static FieldDefinition created(FormPreset.Question question, UUID fieldId) {
    return new FieldDefinition(
        fieldId,
        FieldDefinition.CUSTOM,
        null,
        question.label(),
        0,
        question.type(),
        question.required(),
        question.description(),
        question.config(),
        question.showWhen(),
        false,
        question.key(),
        question.defaults());
  }

  /**
   * The stored question with the new structure. A text keeps the operator's wording when it differs
   * from what was generated last time; untouched text follows the new wording.
   */
  private static FieldDefinition merged(
      FieldDefinition existing, FormPreset.Question question, boolean locked) {
    ObjectNode before = existing.presetState();
    ObjectNode defaults = question.defaults();
    ObjectNode config = question.config().deepCopy();
    if (locked
        && (existing.answerType() != question.type()
            || !Objects.equals(existing.showWhen(), question.showWhen()))) {
      throw new SceneException(ErrorCode.FIELD_LOCKED);
    }
    if (config.has("placeholder")) {
      String kept =
          keep(
              text(existing.config().get("placeholder")),
              text(before.get("placeholder")),
              text(config.get("placeholder")));
      if (kept == null) {
        config.putNull("placeholder");
      } else {
        config.put("placeholder", kept);
      }
    }
    JsonNode list = config.get("options");
    if (list != null) {
      ArrayNode options = (ArrayNode) list;
      Set<String> listed = new HashSet<>();
      for (JsonNode node : options) {
        ObjectNode option = (ObjectNode) node;
        String id = option.get("optionId").asString();
        listed.add(id);
        FieldDefinition.Option was = existing.option(id);
        if (was == null) {
          continue;
        }
        JsonNode condition = option.get("showWhen");
        if (locked && !Objects.equals(was.showWhen(), condition.isNull() ? null : condition)) {
          throw new SceneException(ErrorCode.FIELD_LOCKED);
        }
        option.put(
            "label",
            keep(was.label(), text(before.get("options").get(id)), option.get("label").asString()));
      }
      if (locked) {
        // DEC-068: an option that may hold answers is hidden, not removed.
        for (JsonNode node : existing.config().get("options")) {
          if (!listed.contains(node.get("optionId").asString())) {
            ObjectNode hiddenOption = (ObjectNode) node.deepCopy();
            hiddenOption.put("hidden", true);
            options.add(hiddenOption);
          }
        }
      }
    }
    boolean wasActive = Boolean.TRUE.equals(existing.presetActive());
    return new FieldDefinition(
        existing.fieldId(),
        existing.kind(),
        null,
        keep(existing.label(), text(before.get("label")), question.label()),
        existing.position(),
        question.type(),
        existing.required() == before.get("required").booleanValue()
            ? question.required()
            : existing.required(),
        keep(existing.description(), text(before.get("description")), question.description()),
        config,
        question.showWhen(),
        wasActive && existing.hidden(),
        existing.presetKey(),
        defaults);
  }

  private static FieldDefinition inactive(FieldDefinition field) {
    ObjectNode state = field.presetState().deepCopy();
    state.put("active", false);
    return new FieldDefinition(
        field.fieldId(),
        field.kind(),
        null,
        field.label(),
        field.position(),
        field.answerType(),
        field.required(),
        field.description(),
        field.config(),
        field.showWhen(),
        true,
        field.presetKey(),
        state);
  }

  private static String keep(String current, String generatedBefore, String generatedNow) {
    return Objects.equals(current, generatedBefore) ? generatedNow : current;
  }

  private static String text(JsonNode node) {
    return node == null || node.isNull() ? null : node.asString();
  }

  private static List<UUID> targets(FieldDefinition field) {
    List<UUID> out = new ArrayList<>();
    for (JsonNode clause : FieldRules.clauses(field.showWhen())) {
      out.add(UUID.fromString(clause.get("fieldId").asString()));
    }
    for (FieldDefinition.Option option : field.options()) {
      for (JsonNode clause : FieldRules.clauses(option.showWhen())) {
        out.add(UUID.fromString(clause.get("fieldId").asString()));
      }
    }
    return out;
  }

  /**
   * A new question goes right after the nearest generated question that comes before it in {@link
   * FormPreset#ORDER}. With none, it goes after the last SYSTEM question.
   */
  private static int insertIndex(List<FieldDefinition> ordered, FieldDefinition field) {
    int rank = FormPreset.ORDER.indexOf(field.presetKey());
    int after = -1;
    int lastSystem = -1;
    for (int index = 0; index < ordered.size(); index++) {
      FieldDefinition other = ordered.get(index);
      if (other.isSystem()) {
        lastSystem = index;
      }
      if (other.isPreset() && FormPreset.ORDER.indexOf(other.presetKey()) < rank) {
        after = index;
      }
    }
    return (after >= 0 ? after : lastSystem) + 1;
  }

  /** SYSTEM questions, then generated questions in preset order, then hand-made questions. */
  private static List<FieldDefinition> canonical(List<FieldDefinition> ordered) {
    List<FieldDefinition> out = new ArrayList<>();
    for (FieldDefinition field : ordered) {
      if (field.isSystem()) {
        out.add(field);
      }
    }
    for (String key : FormPreset.ORDER) {
      for (FieldDefinition field : ordered) {
        if (key.equals(field.presetKey())) {
          out.add(field);
        }
      }
    }
    for (FieldDefinition field : ordered) {
      if (!field.isSystem() && !field.isPreset()) {
        out.add(field);
      }
    }
    return out;
  }

  private static List<FieldDefinition> renumber(List<FieldDefinition> ordered) {
    List<FieldDefinition> out = new ArrayList<>();
    for (FieldDefinition field : ordered) {
      out.add(field.withPosition(out.size()));
    }
    return out;
  }

  private static boolean valid(List<FieldDefinition> fields) {
    try {
      FieldRules.checkConditions(fields);
      return true;
    } catch (SceneException exception) {
      return false;
    }
  }
}
