package app.scene.common.tenant;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * #30 access order (issue comment 5946067458, section 2). Stop at the first match. Authentication
 * is the operator chain's job. Field validation and lifecycle conflicts stay later, on the commands
 * that have them.
 *
 * <p>A current operator still needs effective {@link Permission#EVENT_READ}. A missing permission
 * is {@code FORBIDDEN}. Space-path rules are {@link #readSpace(UUID, UUID)} and {@link
 * #spaceMembership(UUID, UUID)}.
 */
@Service
public class OperatorAccess {

  private static final String ACTIVE = "ACTIVE";

  private final OperatorAccessRepository access;

  public OperatorAccess(OperatorAccessRepository access) {
    this.access = access;
  }

  public OperatorEventView readEvent(UUID userId, UUID spaceId, UUID eventId) {
    EventAccessRow row = access.findEvent(spaceId, eventId, userId).orElse(null);
    if (row == null || (!row.eventOperator() && !row.accessRevoked())) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!row.eventOperator()) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    if (!PermissionEvaluator.allows(
        Permission.EVENT_READ, row.eventRole(), row.ownerAuthorityEnded(), row.storedEffect())) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return new OperatorEventView(row.eventId(), spaceId, row.eventName());
  }

  /**
   * Space path after leave (issue comment 5945116073). A kept event does not keep this call. An
   * active member may read the space. {@link SpaceMembership} says who may read or change event
   * permission rows, and neither of those is granted here.
   */
  public OperatorSpaceView readSpace(UUID userId, UUID spaceId) {
    SpaceAccessRow row = loadSpace(userId, spaceId);
    if (row == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!ACTIVE.equals(row.membershipStatus())) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    return new OperatorSpaceView(row.spaceId(), row.spaceName());
  }

  /**
   * Same space row as {@link #readSpace(UUID, UUID)}, without throwing. Callers that stop at the
   * first #30 match use {@link SpaceMembership.Kind#ABSENT} as not found and {@link
   * SpaceMembership.Kind#ENDED} as {@code NOT_A_MEMBER}.
   */
  public SpaceMembership spaceMembership(UUID userId, UUID spaceId) {
    SpaceAccessRow row = loadSpace(userId, spaceId);
    if (row == null) {
      return SpaceMembership.absent();
    }
    if (!ACTIVE.equals(row.membershipStatus())) {
      return SpaceMembership.ended();
    }
    return SpaceMembership.active(row.role());
  }

  /**
   * True when an {@code EVENT_ACCESS_REVOKED} detail names this person as {@code userId}. The actor
   * may be someone else, as on operator removal.
   */
  public boolean eventAccessRevoked(UUID userId, UUID spaceId, UUID eventId) {
    EventAccessRow row = access.findEvent(spaceId, eventId, userId).orElse(null);
    return row != null && row.accessRevoked();
  }

  private SpaceAccessRow loadSpace(UUID userId, UUID spaceId) {
    return access.findSpace(spaceId, userId).orElse(null);
  }
}
