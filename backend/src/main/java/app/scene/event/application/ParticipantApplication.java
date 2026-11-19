package app.scene.event.application;

import app.scene.event.form.FormFieldView;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/**
 * The signed-in participant's current application (DEC-078 §4). {@code fields} have the public form
 * shape; hidden questions and their answers are left out. {@code acceptingEdits} is true when the
 * event is {@code ACTIVE} and the form accepts edits.
 */
public record ParticipantApplication(
    UUID applicationId,
    UUID formId,
    int revision,
    Instant submittedAt,
    boolean acceptingEdits,
    List<FormFieldView> fields,
    List<Answer> answers) {

  public ParticipantApplication {
    fields = List.copyOf(fields);
    answers = List.copyOf(answers);
  }

  public record Answer(UUID fieldId, JsonNode value) {}
}
