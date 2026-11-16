package app.scene.event.form;

import java.util.List;
import java.util.UUID;

/**
 * Form read. Fields are included. Answers and contact stay off. {@code locked} is true once a
 * submitted application exists, so type changes, option removal, condition changes, and deletes
 * answer {@code FIELD_LOCKED} (DEC-068).
 */
public record FormDetail(
    UUID formId, boolean acceptingApplications, List<FormFieldView> fields, boolean locked) {

  public FormDetail {
    fields = List.copyOf(fields);
  }
}
