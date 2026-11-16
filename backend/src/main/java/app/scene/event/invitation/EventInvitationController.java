package app.scene.event.invitation;

import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** DEC-060 invitation list, commands, preview, and accept. */
@RestController
public class EventInvitationController {

  private final EventInvitationService invitations;

  public EventInvitationController(EventInvitationService invitations) {
    this.invitations = invitations;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/invitations")
  ItemPage<InvitationListItem> list(
      @PathVariable UUID eventId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size) {
    return invitations.list(actor(), eventId, page, size);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/invitations")
  IssuedInvitation create(@PathVariable UUID eventId, @RequestBody JsonNode body) {
    return invitations.create(actor(), eventId, body);
  }

  @PostMapping("/api/v1/operator/events/{eventId}/invitations/{invitationId}/resend")
  IssuedInvitation resend(@PathVariable UUID eventId, @PathVariable UUID invitationId) {
    return invitations.resend(actor(), eventId, invitationId);
  }

  @DeleteMapping("/api/v1/operator/events/{eventId}/invitations/{invitationId}")
  InvitationResult revoke(@PathVariable UUID eventId, @PathVariable UUID invitationId) {
    return invitations.revoke(actor(), eventId, invitationId);
  }

  @PostMapping("/api/v1/operator/invitations/preview")
  InvitationPreview preview(@RequestBody JsonNode body, HttpServletRequest request) {
    OperatorPrincipal principal = principal();
    return invitations.preview(
        principal.userId(), principal.email(), text(body, "token"), request.getRemoteAddr());
  }

  @PostMapping("/api/v1/operator/invitations/accept")
  InvitationAcceptance accept(@RequestBody JsonNode body, HttpServletRequest request) {
    OperatorPrincipal principal = principal();
    return invitations.accept(
        principal.userId(), principal.email(), text(body, "token"), request.getRemoteAddr());
  }

  private static OperatorPrincipal principal() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication());
  }

  private static UUID actor() {
    return principal().userId();
  }

  private static String text(JsonNode body, String field) {
    if (body == null || !body.isObject()) {
      return "";
    }
    JsonNode node = body.get(field);
    if (node == null || !node.isString()) {
      return "";
    }
    return node.asString();
  }
}
