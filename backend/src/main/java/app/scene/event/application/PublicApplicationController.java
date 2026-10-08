package app.scene.event.application;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Public first submit. No operator session. {@code Idempotency-Key} is not read. Success is 201
 * with no {@code Location} header.
 */
@RestController
public class PublicApplicationController {

  private final PublicApplicationService applications;

  public PublicApplicationController(PublicApplicationService applications) {
    this.applications = applications;
  }

  @PostMapping("/api/v1/public/events/{eventId}/forms/{formId}/applications")
  ResponseEntity<SubmittedApplication> submit(
      @PathVariable UUID eventId,
      @PathVariable UUID formId,
      @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(applications.submit(eventId, formId, body));
  }
}
