package app.scene.event.form;

import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Operator form and field routes. Create is 201 with no {@code Location} header. Field removal is
 * 204 with no body. These routes do not read {@code Idempotency-Key}. Public and participant routes
 * stay closed.
 */
@RestController
public class OperatorFormController {

  private final OperatorFormService forms;

  public OperatorFormController(OperatorFormService forms) {
    this.forms = forms;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/forms")
  ItemPage<FormListItem> list(
      @PathVariable UUID eventId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort) {
    return forms.list(actor(), eventId, page, size, sort);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/forms")
  ResponseEntity<FormDetail> create(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(forms.create(actor(), eventId, body));
  }

  @GetMapping("/api/v1/operator/events/{eventId}/forms/{formId}")
  FormDetail read(@PathVariable UUID eventId, @PathVariable UUID formId) {
    return forms.read(actor(), eventId, formId);
  }

  @PatchMapping("/api/v1/operator/events/{eventId}/forms/{formId}")
  FormDetail patch(
      @PathVariable UUID eventId,
      @PathVariable UUID formId,
      @RequestBody(required = false) JsonNode body) {
    return forms.updateAccepting(actor(), eventId, formId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/forms/{formId}/fields")
  ResponseEntity<FormDetail> addField(
      @PathVariable UUID eventId,
      @PathVariable UUID formId,
      @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(forms.addField(actor(), eventId, formId, body));
  }

  @PatchMapping("/api/v1/operator/events/{eventId}/forms/{formId}/fields/{fieldId}")
  FormDetail patchField(
      @PathVariable UUID eventId,
      @PathVariable UUID formId,
      @PathVariable UUID fieldId,
      @RequestBody(required = false) JsonNode body) {
    return forms.renameField(actor(), eventId, formId, fieldId, body);
  }

  @DeleteMapping("/api/v1/operator/events/{eventId}/forms/{formId}/fields/{fieldId}")
  ResponseEntity<Void> deleteField(
      @PathVariable UUID eventId, @PathVariable UUID formId, @PathVariable UUID fieldId) {
    forms.deleteField(actor(), eventId, formId, fieldId);
    return ResponseEntity.noContent().build();
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
