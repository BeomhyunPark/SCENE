package app.scene.event.checkin;

import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Operator check-in routes (api.md "체크인"). Check-in and cancel read {@code Idempotency-Key}. The
 * participant QR route is #283 and is not here.
 */
@RestController
public class CheckInController {

  private static final String BASE = "/api/v1/operator/events/{eventId}";

  private final CheckInService checkIns;

  public CheckInController(CheckInService checkIns) {
    this.checkIns = checkIns;
  }

  @GetMapping(BASE + "/check-ins/summary")
  CheckInSummary summary(@PathVariable UUID eventId) {
    return checkIns.summary(actor(), eventId);
  }

  @GetMapping(BASE + "/check-in-roster")
  ItemPage<RosterItem> roster(
      @PathVariable UUID eventId,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) String checkedIn,
      @RequestParam(required = false) String arrival,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size) {
    return checkIns.roster(actor(), eventId, q, checkedIn, arrival, page, size);
  }

  @GetMapping(BASE + "/check-in-logs")
  ItemPage<CheckInLogItem> logs(
      @PathVariable UUID eventId,
      @RequestParam(required = false) String participantId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size) {
    return checkIns.logs(actor(), eventId, participantId, page, size);
  }

  @PostMapping(BASE + "/check-ins")
  CheckInResult checkIn(
      @PathVariable UUID eventId,
      @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody(required = false) JsonNode body) {
    return checkIns.checkIn(actor(), eventId, idempotencyKey, body);
  }

  @PostMapping(BASE + "/check-ins/{checkInId}/cancel")
  CancelResult cancel(
      @PathVariable UUID eventId,
      @PathVariable UUID checkInId,
      @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody(required = false) JsonNode body) {
    return checkIns.cancel(actor(), eventId, checkInId, idempotencyKey, body);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
