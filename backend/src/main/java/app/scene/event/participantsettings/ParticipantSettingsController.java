package app.scene.event.participantsettings;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Event participant settings read and write (DEC-083 §2). {@code Idempotency-Key} is not read. */
@RestController
public class ParticipantSettingsController {

  private final ParticipantSettingsService settings;

  public ParticipantSettingsController(ParticipantSettingsService settings) {
    this.settings = settings;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/participant-settings")
  ParticipantSettings read(@PathVariable UUID eventId) {
    return settings.read(actor(), eventId);
  }

  @PutMapping("/api/v1/operator/events/{eventId}/participant-settings")
  ParticipantSettings write(@PathVariable UUID eventId, @RequestBody JsonNode body) {
    return settings.write(actor(), eventId, body);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
