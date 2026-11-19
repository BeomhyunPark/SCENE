package app.scene.space.invitation;

import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
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

/** DEC-076 space invitations, their preview and accept, and the member list. */
@RestController
public class SpaceInvitationController {

  private final SpaceInvitationService invitations;
  private final SpaceMemberService members;

  public SpaceInvitationController(SpaceInvitationService invitations, SpaceMemberService members) {
    this.invitations = invitations;
    this.members = members;
  }

  @GetMapping("/api/v1/operator/spaces/{spaceId}/members")
  ItemPage<SpaceMemberItem> members(
      @PathVariable UUID spaceId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size) {
    return members.list(actor(), spaceId, page, size);
  }

  @GetMapping("/api/v1/operator/spaces/{spaceId}/invitations")
  ItemPage<SpaceInvitationListItem> list(
      @PathVariable UUID spaceId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size) {
    return invitations.list(actor(), spaceId, page, size);
  }

  @PostMapping("/api/v1/operator/spaces/{spaceId}/invitations")
  IssuedSpaceInvitation create(@PathVariable UUID spaceId, @RequestBody JsonNode body) {
    return invitations.create(actor(), spaceId, body);
  }

  @PostMapping("/api/v1/operator/spaces/{spaceId}/invitations/{invitationId}/resend")
  IssuedSpaceInvitation resend(@PathVariable UUID spaceId, @PathVariable UUID invitationId) {
    return invitations.resend(actor(), spaceId, invitationId);
  }

  @DeleteMapping("/api/v1/operator/spaces/{spaceId}/invitations/{invitationId}")
  SpaceInvitationResult revoke(@PathVariable UUID spaceId, @PathVariable UUID invitationId) {
    return invitations.revoke(actor(), spaceId, invitationId);
  }

  @PostMapping("/api/v1/operator/space-invitations/preview")
  SpaceInvitationPreview preview(@RequestBody JsonNode body) {
    OperatorPrincipal principal = principal();
    return invitations.preview(principal.userId(), principal.email(), text(body, "token"));
  }

  @PostMapping("/api/v1/operator/space-invitations/accept")
  SpaceInvitationAcceptance accept(@RequestBody JsonNode body) {
    OperatorPrincipal principal = principal();
    return invitations.accept(principal.userId(), principal.email(), text(body, "token"));
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
