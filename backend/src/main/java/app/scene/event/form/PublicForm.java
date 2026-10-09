package app.scene.event.form;

import java.util.List;
import java.util.UUID;

/** Public form read. Fields only. Acceptance, answers, and contact stay off. */
public record PublicForm(UUID formId, List<FormFieldView> fields) {

  public PublicForm {
    fields = List.copyOf(fields);
  }
}
