package app.scene.event.form;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.EventRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Public form field list. §7 names this GET next to submit and does not name the body. The body is
 * the field list only. Hidden questions and hidden options are left out (DEC-068); option and
 * question {@code showWhen} stay so the page can show and hide questions. A closed form uses {@code
 * FORM_CLOSED}. {@code APPLICATION_CLOSED} is not returned. No audit row is written.
 */
@Service
public class PublicFormService {

  private final EventRepository events;
  private final FormRepository forms;
  private final JsonMapper json;

  public PublicFormService(EventRepository events, FormRepository forms, JsonMapper json) {
    this.events = events;
    this.forms = forms;
    this.json = json;
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
      FieldDefinition field = FieldDefinition.from(row, json);
      if (!field.hidden()) {
        fields.add(field.publicView());
      }
    }
    return new PublicForm(form.id(), fields);
  }
}
