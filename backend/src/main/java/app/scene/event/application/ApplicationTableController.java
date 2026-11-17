package app.scene.event.application;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Applicant table (#308). A read; no CSRF, no {@code Idempotency-Key}. */
@RestController
public class ApplicationTableController {

  private final ApplicationTableService tables;

  public ApplicationTableController(ApplicationTableService tables) {
    this.tables = tables;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/applications/table")
  ResponseEntity<ApplicationTable> read(@PathVariable UUID eventId) {
    UUID actor =
        OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication()).userId();
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(tables.read(actor, eventId));
  }
}
