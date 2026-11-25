package app.scene.event.application;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * An operator edits a participant's answers and adds a participant (DEC-088, A12 #462). CSRF
 * applies; {@code Idempotency-Key} is not read. The add answer carries the temporary number once,
 * so it is {@code no-store}.
 */
@RestController
public class OperatorApplicationEditController {

  private final OperatorApplicationEditService edits;

  public OperatorApplicationEditController(OperatorApplicationEditService edits) {
    this.edits = edits;
  }

  @PutMapping("/api/v1/operator/events/{eventId}/applications/{applicationId}/answers")
  OperatorApplicationEditService.Revised revise(
      @PathVariable UUID eventId, @PathVariable UUID applicationId, @RequestBody JsonNode body) {
    return edits.revise(actor(), eventId, applicationId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/applications")
  ResponseEntity<OperatorApplicationEditService.Added> add(
      @PathVariable UUID eventId, @RequestBody JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED)
        .cacheControl(CacheControl.noStore())
        .body(edits.add(actor(), eventId, body));
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
