package app.scene.space;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * DEC-060 leave with DEC-063 blocks. One code is returned, in the order handover, last owner, held
 * owner role, then open responsibility. A block changes no access.
 */
@Service
public class MembershipLeaveService {

  private final MembershipLeaveMapper mapper;

  public MembershipLeaveService(MembershipLeaveMapper mapper) {
    this.mapper = mapper;
  }

  /** Same block order as {@link #leave}. A clear preview is not a guarantee on the later leave. */
  @Transactional(readOnly = true)
  public ErrorCode leavePreview(UUID spaceId, UUID userId) {
    if (mapper.activeMember(spaceId, userId) == 0) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    return firstBlock(spaceId, userId, mapper.operatedEvents(spaceId, userId));
  }

  @Transactional
  public void leave(UUID spaceId, UUID userId, List<UUID> keepEventIds) {
    if (mapper.activeMember(spaceId, userId) == 0) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    List<OperatedEvent> events = mapper.operatedEvents(spaceId, userId);
    ErrorCode block = firstBlock(spaceId, userId, events);
    if (block != null) {
      throw new SceneException(block);
    }
    if (keepEventIds == null) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "keepEventIds"));
    }
    Set<UUID> known = new HashSet<>();
    for (OperatedEvent event : events) {
      known.add(event.eventId());
    }
    for (UUID keepId : keepEventIds) {
      if (!known.contains(keepId)) {
        throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "keepEventIds"));
      }
    }
    for (OperatedEvent event : events) {
      if ((event.owner() || event.handoverAccepted()) && keepEventIds.contains(event.eventId())) {
        throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "keepEventIds"));
      }
    }
    for (OperatedEvent event : events) {
      if (!keepEventIds.contains(event.eventId())) {
        mapper.deleteOperator(event.eventId(), userId);
      }
      if (event.handoverAccepted()) {
        mapper.completeHandover(event.eventId(), userId);
        mapper.deleteOperator(event.eventId(), userId);
      }
    }
    if (mapper.leaveMembership(spaceId, userId) != 1) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
  }

  private ErrorCode firstBlock(UUID spaceId, UUID userId, List<OperatedEvent> events) {
    if (mapper.pendingHandoverFrom(spaceId, userId) > 0) {
      return ErrorCode.HANDOVER_NOT_ACCEPTED;
    }
    boolean onlySpaceOwner =
        mapper.otherSpaceOwners(spaceId, userId) == 0 && mapper.isSpaceOwner(spaceId, userId) > 0;
    for (OperatedEvent event : events) {
      if (event.owner() && !event.handoverAccepted() && event.otherOwners() == 0) {
        return ErrorCode.LAST_OWNER;
      }
    }
    if (onlySpaceOwner) {
      return ErrorCode.LAST_OWNER;
    }
    for (OperatedEvent event : events) {
      if (event.owner() && !event.handoverAccepted()) {
        return ErrorCode.OWNER_ROLE_HELD;
      }
    }
    for (OperatedEvent event : events) {
      if (event.openTasks() > 0) {
        return ErrorCode.RESPONSIBILITY;
      }
    }
    return null;
  }
}
