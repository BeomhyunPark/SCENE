package app.scene.event.application;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Operator withdraw and restore (DEC-084). CSRF is required; {@code Idempotency-Key} is not read
 * because a repeat answers {@code ALREADY_…}.
 */
@RestController
public class ApplicationWithdrawalController {

  private final ApplicationWithdrawalService withdrawals;

  public ApplicationWithdrawalController(ApplicationWithdrawalService withdrawals) {
    this.withdrawals = withdrawals;
  }

  @PostMapping("/api/v1/operator/events/{eventId}/applications/{applicationId}/withdraw")
  ResponseEntity<ApplicationWithdrawalService.WithdrawResult> withdraw(
      @PathVariable UUID eventId,
      @PathVariable UUID applicationId,
      @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.ok(withdrawals.withdraw(actor(), eventId, applicationId, body));
  }

  @PostMapping("/api/v1/operator/events/{eventId}/applications/{applicationId}/restore")
  ResponseEntity<ApplicationWithdrawalService.RestoreResult> restore(
      @PathVariable UUID eventId, @PathVariable UUID applicationId) {
    return ResponseEntity.ok(withdrawals.restore(actor(), eventId, applicationId));
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
