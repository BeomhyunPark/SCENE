package app.scene.event.lifecycle;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.tenant.OperatorAccess;
import app.scene.common.tenant.SpaceMembership;
import app.scene.space.EventUserRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Event-path access order shared by lifecycle and task HTTP. Stop at the first match: missing
 * event, revoked access, ended membership, then an active space member with no event row. Matches
 * {@code OperatorPermissionService} so a stranger stays 404 and a removed operator stays {@code
 * NOT_A_MEMBER}.
 */
@Service
public class EventAccessGate {

  private final EventRepository events;
  private final EventUserRepository eventUsers;
  private final OperatorAccess access;

  public EventAccessGate(
      EventRepository events, EventUserRepository eventUsers, OperatorAccess access) {
    this.events = events;
    this.eventUsers = eventUsers;
    this.access = access;
  }

  public Opened open(UUID actorId, UUID eventId) {
    EventLocation location =
        events
            .findLocation(eventId)
            .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
    UUID spaceId = location.spaceId();
    if (events.find(spaceId, eventId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    String eventRole = eventUsers.findRole(spaceId, eventId, actorId).orElse(null);
    if (eventRole == null && access.eventAccessRevoked(actorId, spaceId, eventId)) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    SpaceMembership membership = access.spaceMembership(actorId, spaceId);
    if (eventRole == null) {
      if (membership.kind() == SpaceMembership.Kind.ENDED) {
        throw new SceneException(ErrorCode.NOT_A_MEMBER);
      }
      if (membership.kind() != SpaceMembership.Kind.ACTIVE) {
        throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
      }
    }
    boolean authorityEnded =
        eventRole != null && eventUsers.existsAuthorityEnded(spaceId, eventId, actorId);
    return new Opened(location, eventRole, authorityEnded, membership);
  }

  /**
   * Effective event role. An OWNER whose handover has ended is not an event owner. Space role is
   * set only for an active membership.
   */
  public OperatorActor actor(UUID actorId, Opened opened) {
    String eventRole = opened.eventRole();
    if ("OWNER".equals(eventRole) && opened.authorityEnded()) {
      eventRole = null;
    }
    SpaceMembership membership = opened.membership();
    String spaceRole = membership.kind() == SpaceMembership.Kind.ACTIVE ? membership.role() : null;
    return new OperatorActor(actorId, spaceRole, eventRole);
  }

  /** Event operators with {@code EVENT_READ}, and an active space owner. */
  public boolean mayRead(Opened opened) {
    if (opened.eventRole() != null
        && PermissionEvaluator.allows(
            Permission.EVENT_READ, opened.eventRole(), opened.authorityEnded(), null)) {
      return true;
    }
    SpaceMembership membership = opened.membership();
    return membership.kind() == SpaceMembership.Kind.ACTIVE && "OWNER".equals(membership.role());
  }

  public record Opened(
      EventLocation location,
      String eventRole,
      boolean authorityEnded,
      SpaceMembership membership) {}
}
