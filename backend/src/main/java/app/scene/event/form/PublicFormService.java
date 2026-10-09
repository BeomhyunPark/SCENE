package app.scene.event.form;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Public form field list. §7 names this GET next to submit and does not name the body. The body is
 * the field list only. A closed form uses {@code FORM_CLOSED}. {@code APPLICATION_CLOSED} is not
 * returned. No audit row is written.
 */
@Service
public class PublicFormService {

  private final EventRepository events;
  private final FormRepository forms;

  public PublicFormService(EventRepository events, FormRepository forms) {
    this.events = events;
    this.forms = forms;
  }

  public PublicForm read(UUID eventId, UUID formId) {
    UUID spaceId =
        events
            .findLocation(eventId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND))
            .spaceId();
    FormRow form =
        forms
            .find(spaceId, eventId, formId)
            .orElseThrow(() -> new SceneException(ErrorCode.FORM_NOT_FOUND));
    if (!form.acceptingApplications()) {
      throw new SceneException(ErrorCode.FORM_CLOSED);
    }
    List<FormFieldView> fields = new ArrayList<>();
    for (FormFieldRow row : forms.findFields(spaceId, eventId, formId)) {
      fields.add(
          new FormFieldView(
              row.fieldId(), row.kind(), row.systemKey(), row.label(), row.position()));
    }
    return new PublicForm(form.id(), fields);
  }
}
