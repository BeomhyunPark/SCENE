package app.scene.common.tenant;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * #30 access order (issue comment 5946067458, section 2). Stop at the first match. Authentication
 * is the operator chain's job. Field validation and lifecycle conflicts stay later, on the commands
 * that have them.
 *
 * <p>P0-11 owns the permission enum, role defaults, GRANT/REVOKE, and Space-path override. Until
 * then, {@link #CALL_NOT_ALLOWED_EVENT_NAME} is the only way a current operator is refused with
 * {@code FORBIDDEN}.
 */
@Service
public class OperatorAccess {

  /**
   * Fixed fixture, not a permission key. A current operator of an event with this name is a member
   * the call does not allow.
   */
  public static final String CALL_NOT_ALLOWED_EVENT_NAME = "fixture-call-not-allowed";

  private static final String ACTIVE = "ACTIVE";

  private final OperatorAccessMapper mapper;

  public OperatorAccess(OperatorAccessMapper mapper) {
    this.mapper = mapper;
  }

  @Transactional(readOnly = true)
  public OperatorEventView readEvent(UUID userId, UUID spaceId, UUID eventId) {
    EventAccessRow row = mapper.findEvent(spaceId, eventId, userId);
    if (row == null || (!row.eventOperator() && !row.accessRevoked())) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!row.eventOperator()) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    if (CALL_NOT_ALLOWED_EVENT_NAME.equals(row.eventName())) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return new OperatorEventView(row.eventId(), spaceId, row.eventName());
  }

  /**
   * Space path after leave (issue comment 5945116073). A kept event does not keep this call. An
   * active member may read the space; who may do more is P0-11.
   */
  @Transactional(readOnly = true)
  public OperatorSpaceView readSpace(UUID userId, UUID spaceId) {
    SpaceAccessRow row = mapper.findSpace(spaceId, userId);
    if (row == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!ACTIVE.equals(row.membershipStatus())) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    return new OperatorSpaceView(row.spaceId(), row.spaceName());
  }
}
