package app.scene.event.application;

import app.scene.event.form.AnswerType;
import app.scene.event.form.FieldDefinition;
import app.scene.event.form.FormFieldRow;
import app.scene.event.form.FormRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A group member's current application as their leader reads it (DEC-083 §3, #452). Answers follow
 * the form's question order. Left out: the SYSTEM name and phone (the detail carries them already),
 * turned-off questions ({@code hidden}), consent answers ({@code YES_NO} with {@code style:
 * CONSENT}), and the operator memo ({@code application_operations} is not read). {@code display} is
 * the same reading text the operator table and CSV use ({@link AnswerText}).
 *
 * <p>{@code operatorEdited} is true when the last revision that changed the question was saved by
 * an operator; {@code revisedByOperator} is whether the current revision was. Both read the stored
 * revisions only (DEC-078 §4); operator values outside revisions (A12) do not exist yet.
 */
@Component
public class MemberApplicationReader {

  private static final String CONSENT = "CONSENT";
  private static final String PHONE = "PHONE";
  private static final String NAME = "NAME";

  private final ApplicationRevisions revisions;
  private final ApplicationRepository applications;
  private final FormRepository forms;
  private final JsonMapper json;

  public MemberApplicationReader(
      ApplicationRevisions revisions,
      ApplicationRepository applications,
      FormRepository forms,
      JsonMapper json) {
    this.revisions = revisions;
    this.applications = applications;
    this.forms = forms;
    this.json = json;
  }

  /**
   * One shown answer. {@code value} is the stored shape (DEC-068 §1). {@code phone} marks a filled
   * {@code SHORT_TEXT} answer with {@code format: PHONE}; callers do not send it.
   */
  public record Answer(
      UUID fieldId,
      String presetKey,
      String label,
      String type,
      String display,
      JsonNode value,
      boolean operatorEdited,
      boolean phone) {}

  /**
   * {@code submittedAt} is the first submit; {@code revisedAt} is when the current revision was
   * stored, or null when it is the first one.
   */
  public record MemberApplication(
      Instant submittedAt, Instant revisedAt, boolean revisedByOperator, List<Answer> answers) {

    /** Field ids of the answers that hold a phone number, in answer order. */
    public List<UUID> phoneFieldIds() {
      List<UUID> out = new ArrayList<>();
      for (Answer answer : answers) {
        if (answer.phone()) {
          out.add(answer.fieldId());
        }
      }
      return out;
    }
  }

  /** The participant's current SUBMITTED application, or empty when there is none. */
  public Optional<MemberApplication> read(UUID spaceId, UUID eventId, UUID participantId) {
    ApplicationRevisionRow current = revisions.findCurrent(spaceId, eventId, participantId);
    if (current == null) {
      return Optional.empty();
    }
    List<ApplicationRevisionRow> chain =
        new ArrayList<>(revisions.listByApplication(spaceId, eventId, current.applicationId()));
    chain.sort((a, b) -> Integer.compare(a.revision(), b.revision()));
    Instant submittedAt = chain.isEmpty() ? current.submittedAt() : chain.get(0).submittedAt();
    Map<UUID, String> lastEditor = new HashMap<>();
    for (ApplicationRevisionRow revision : chain) {
      if (revision.revision() > current.revision() || revision.revisedBy() == null) {
        continue;
      }
      JsonNode changes = revision.changes() == null ? null : json.readTree(revision.changes());
      if (changes != null && changes.isArray()) {
        for (JsonNode change : changes) {
          if (change.path("fieldId").isString()) {
            lastEditor.put(UUID.fromString(change.get("fieldId").asString()), revision.revisedBy());
          }
        }
      }
    }

    Map<UUID, JsonNode> stored = new HashMap<>();
    for (ApplicationAnswerRow row :
        applications.findAnswers(spaceId, eventId, current.applicationId())) {
      stored.put(row.fieldId(), json.readTree(row.value()));
    }
    List<Answer> answers = new ArrayList<>();
    for (FormFieldRow row : forms.findFields(spaceId, eventId, current.formId())) {
      FieldDefinition field = FieldDefinition.from(row, json);
      JsonNode value = stored.get(field.fieldId());
      if (value == null || !shown(field)) {
        continue;
      }
      answers.add(
          new Answer(
              field.fieldId(),
              field.presetKey(),
              field.label(),
              field.answerType().name(),
              AnswerText.format(field.answerType().name(), field.config(), value),
              value,
              ApplicationRevisions.BY_OPERATOR.equals(lastEditor.get(field.fieldId())),
              phone(field, value)));
    }
    return Optional.of(
        new MemberApplication(
            submittedAt,
            current.revision() > 1 ? current.submittedAt() : null,
            ApplicationRevisions.BY_OPERATOR.equals(current.revisedBy()),
            List.copyOf(answers)));
  }

  private static boolean shown(FieldDefinition field) {
    if (field.hidden()) {
      return false;
    }
    if (field.isSystem() && (NAME.equals(field.systemKey()) || PHONE.equals(field.systemKey()))) {
      return false;
    }
    return !(field.answerType() == AnswerType.YES_NO
        && CONSENT.equals(text(field.config().path("style"))));
  }

  private static boolean phone(FieldDefinition field, JsonNode value) {
    if (field.answerType() != AnswerType.SHORT_TEXT
        || !PHONE.equals(text(field.config().path("format")))) {
      return false;
    }
    JsonNode text = value.path("text");
    return text.isString() && !text.asString().isBlank();
  }

  private static String text(JsonNode node) {
    return node.isString() ? node.asString() : null;
  }
}
