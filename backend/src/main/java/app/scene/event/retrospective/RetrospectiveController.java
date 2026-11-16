package app.scene.event.retrospective;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Event retrospective read and write. {@code Idempotency-Key} is not read. */
@RestController
public class RetrospectiveController {

  private final RetrospectiveService retrospectives;

  public RetrospectiveController(RetrospectiveService retrospectives) {
    this.retrospectives = retrospectives;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/retrospective")
  Retrospective read(@PathVariable UUID eventId) {
    return retrospectives.read(actor(), eventId);
  }

  @PutMapping("/api/v1/operator/events/{eventId}/retrospective")
  Retrospective write(@PathVariable UUID eventId, @RequestBody JsonNode body) {
    return retrospectives.write(actor(), eventId, body);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
