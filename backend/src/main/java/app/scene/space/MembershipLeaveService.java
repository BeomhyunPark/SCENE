package app.scene.space;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * DEC-060 leave with DEC-063 blocks. One code is returned, in the order handover, last owner, held
 * owner role, then open responsibility. A block changes no access.
 */
@Service
public class MembershipLeaveService {

  /**
   * Stored on each cleared-task audit when the person leaves. Operator removal uses its own text.
   */
  static final String LEAVE_REASON = "이탈";

  static final String TASK_ASSIGNEE_CLEARED = "TASK_ASSIGNEE_CLEARED";
  static final String EVENT_ACCESS_REVOKED = "EVENT_ACCESS_REVOKED";

  private final MembershipLeaveMapper mapper;
  private final JsonMapper json;
  private final Clock clock;

  public MembershipLeaveService(MembershipLeaveMapper mapper, JsonMapper json, Clock clock) {
    this.mapper = mapper;
    this.json = json;
    this.clock = clock;
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
      if (keepEventIds.contains(event.eventId())) {
        continue;
      }
      revokeEventAccess(spaceId, event.eventId(), userId, LEAVE_REASON);
      if (event.handoverAccepted()
          && mapper.completeHandover(spaceId, event.eventId(), userId) != 1) {
        throw new IllegalStateException("accepted handover was not completed");
      }
    }
    if (mapper.leaveMembership(spaceId, userId) != 1) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
  }

  /**
   * Drops one event operator. Clears every task assigned to them, including DONE and CANCELLED,
   * records the override rows CASCADE would remove, then deletes {@code event_users}. {@code
   * reason} is the task-audit text ({@code 이탈} here, {@code 운영자 제거} when operator removal is
   * added). Kept events must not call this.
   */
  void revokeEventAccess(UUID spaceId, UUID eventId, UUID userId, String reason) {
    if (mapper.lockOperator(spaceId, eventId, userId) == null) {
      throw new IllegalStateException("event operator row was not locked");
    }
    List<AssignedTask> tasks = mapper.assignedTasks(spaceId, eventId, userId);
    if (mapper.clearAssignees(spaceId, eventId, userId) != tasks.size()) {
      throw new IllegalStateException("assigned tasks were not cleared");
    }
    Instant occurredAt = clock.instant();
    for (AssignedTask task : tasks) {
      Map<String, Object> detail = new LinkedHashMap<>();
      detail.put("taskId", task.id());
      detail.put("previousAssigneeUserId", userId);
      detail.put("reason", reason);
      detail.put("version", task.version() + 1);
      audit(spaceId, eventId, userId, TASK_ASSIGNEE_CLEARED, detail, occurredAt);
    }
    String snapshot = mapper.permissionSnapshot(spaceId, eventId, userId);
    if (mapper.deleteOperator(spaceId, eventId, userId) != 1) {
      throw new IllegalStateException("event operator row was not deleted");
    }
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("userId", userId);
    detail.put("deletedOverrides", json.readTree(snapshot));
    audit(spaceId, eventId, userId, EVENT_ACCESS_REVOKED, detail, occurredAt);
  }

  private void audit(
      UUID spaceId,
      UUID eventId,
      UUID actorUserId,
      String action,
      Map<String, Object> detail,
      Instant occurredAt) {
    mapper.audit(
        UUID.randomUUID(),
        spaceId,
        eventId,
        actorUserId,
        action,
        json.writeValueAsString(detail),
        occurredAt);
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
