package app.scene.event.invitation;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** DEC-060 invitation commands. Preview and accept stay on a later slice. */
@RestController
public class EventInvitationController {

  private final EventInvitationService invitations;

  public EventInvitationController(EventInvitationService invitations) {
    this.invitations = invitations;
  }

  @PostMapping("/api/v1/operator/events/{eventId}/invitations")
  InvitationResult create(@PathVariable UUID eventId, @RequestBody JsonNode body) {
    return invitations.create(actor(), eventId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/invitations/{invitationId}/resend")
  InvitationResult resend(@PathVariable UUID eventId, @PathVariable UUID invitationId) {
    return invitations.resend(actor(), eventId, invitationId);
  }

  @DeleteMapping("/api/v1/operator/events/{eventId}/invitations/{invitationId}")
  InvitationResult revoke(@PathVariable UUID eventId, @PathVariable UUID invitationId) {
    return invitations.revoke(actor(), eventId, invitationId);
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
