package app.scene.event.transfer;

import app.scene.identity.OperatorPrincipal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Event owner transfer routes from issue #30's draft. The confirmed DEC-063 section does not name
 * them. Create is 201 with no {@code Location}. Accept, reject, cancel, and read stay 200. Leave
 * and the space owner-transfer route stay closed.
 */
@RestController
public class OwnerTransferController {

  private final OperatorOwnerTransferService transfers;

  public OwnerTransferController(OperatorOwnerTransferService transfers) {
    this.transfers = transfers;
  }

  @PostMapping("/api/v1/operator/events/{eventId}/owner-transfers")
  ResponseEntity<Map<String, Object>> create(
      @PathVariable UUID eventId, @RequestBody(required = false) JsonNode body) {
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(transfers.request(actor(), eventId, body));
  }

  @GetMapping("/api/v1/operator/owner-transfers/{transferId}")
  Map<String, Object> read(@PathVariable UUID transferId) {
    return transfers.read(actor(), transferId);
  }

  @PostMapping("/api/v1/operator/owner-transfers/{transferId}/accept")
  Map<String, Object> accept(@PathVariable UUID transferId) {
    return transfers.accept(actor(), transferId);
  }

  @PostMapping("/api/v1/operator/owner-transfers/{transferId}/reject")
  Map<String, Object> reject(@PathVariable UUID transferId) {
    return transfers.decline(actor(), transferId);
  }

  @PostMapping("/api/v1/operator/owner-transfers/{transferId}/cancel")
  Map<String, Object> cancel(@PathVariable UUID transferId) {
    return transfers.cancel(actor(), transferId);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
