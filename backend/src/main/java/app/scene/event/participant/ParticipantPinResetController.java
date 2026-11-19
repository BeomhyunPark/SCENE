package app.scene.event.participant;

import app.scene.identity.OperatorPrincipal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** Operator reset of a participant's number (DEC-078 §2). The body is not read. */
@RestController
public class ParticipantPinResetController {

  private final ParticipantPinResetService resets;

  public ParticipantPinResetController(ParticipantPinResetService resets) {
    this.resets = resets;
  }

  @PostMapping("/api/v1/operator/events/{eventId}/participants/{participantId}/pin-reset")
  ResponseEntity<Map<String, String>> reset(
      @PathVariable UUID eventId, @PathVariable UUID participantId) {
    String temporary = resets.reset(actor(), eventId, participantId);
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(Map.of("temporaryPin", temporary));
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
