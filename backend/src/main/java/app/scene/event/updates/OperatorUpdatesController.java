package app.scene.event.updates;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/operator/events/{eventId}/updates}. Operator session, {@code no-store}. */
@RestController
public class OperatorUpdatesController {

  private final OperatorUpdatesService updates;

  public OperatorUpdatesController(OperatorUpdatesService updates) {
    this.updates = updates;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/updates")
  ResponseEntity<OperatorUpdates> read(@PathVariable UUID eventId) {
    UUID actor =
        OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication()).userId();
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(updates.read(actor, eventId));
  }
}
