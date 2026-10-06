package app.scene.event;

import app.scene.common.tenant.OperatorAccess;
import app.scene.common.tenant.OperatorEventView;
import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Proves the access order for one event. Lifecycle and invitation commands stay out. */
@RestController
public class OperatorEventController {

  private final OperatorAccess access;

  public OperatorEventController(OperatorAccess access) {
    this.access = access;
  }

  @GetMapping("/api/v1/operator/spaces/{spaceId}/events/{eventId}")
  OperatorEventView read(@PathVariable UUID spaceId, @PathVariable UUID eventId) {
    OperatorPrincipal principal =
        OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication());
    return access.readEvent(principal.userId(), spaceId, eventId);
  }
}
