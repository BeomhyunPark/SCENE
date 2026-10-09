package app.scene.event.form;

import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Public form read. No operator session. This route does not write. */
@RestController
public class PublicFormController {

  private final PublicFormService forms;

  public PublicFormController(PublicFormService forms) {
    this.forms = forms;
  }

  @GetMapping("/api/v1/public/events/{eventId}/forms/{formId}")
  PublicForm read(@PathVariable UUID eventId, @PathVariable UUID formId) {
    return forms.read(eventId, formId);
  }
}
