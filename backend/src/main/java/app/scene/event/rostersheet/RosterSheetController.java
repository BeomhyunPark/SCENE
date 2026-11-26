package app.scene.event.rostersheet;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** 참가 현황 operator sheet read and change (#508). {@code Idempotency-Key} is not read. */
@RestController
public class RosterSheetController {

  private final RosterSheetService sheets;

  public RosterSheetController(RosterSheetService sheets) {
    this.sheets = sheets;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/roster-sheet")
  RosterSheet read(@PathVariable UUID eventId) {
    return sheets.read(actor(), eventId);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/roster-sheet/ops")
  RosterSheet apply(@PathVariable UUID eventId, @RequestBody JsonNode body) {
    return sheets.apply(actor(), eventId, body);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
