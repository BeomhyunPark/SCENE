package app.scene.event.application;

import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Operator application reads. These routes do not read {@code Idempotency-Key}. Public and
 * participant routes stay closed. There is no create, update, or delete.
 */
@RestController
public class OperatorApplicationController {

  private final OperatorApplicationService applications;

  public OperatorApplicationController(OperatorApplicationService applications) {
    this.applications = applications;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/applications")
  ItemPage<ApplicationListItem> list(
      @PathVariable UUID eventId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort,
      @RequestParam(required = false) List<String> status) {
    return applications.list(actor(), eventId, page, size, sort, status);
  }

  @GetMapping("/api/v1/operator/events/{eventId}/applications/{applicationId}")
  ApplicationDetail read(@PathVariable UUID eventId, @PathVariable UUID applicationId) {
    return applications.read(actor(), eventId, applicationId);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
