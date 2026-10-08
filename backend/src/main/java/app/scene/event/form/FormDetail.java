package app.scene.event.form;

import java.util.List;
import java.util.UUID;

/** Form read. Fields are included. Answers and contact stay off. */
public record FormDetail(UUID formId, boolean acceptingApplications, List<FormFieldView> fields) {

  public FormDetail {
    fields = List.copyOf(fields);
  }
}
