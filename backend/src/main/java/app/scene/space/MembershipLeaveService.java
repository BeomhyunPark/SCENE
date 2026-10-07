package app.scene.space;

import app.scene.common.audit.AuditActions;
import app.scene.common.audit.AuditLogRepository;
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

  private final MemberRepository members;
  private final EventUserRepository eventUsers;
  private final MembershipTransferRepository transfers;
  private final TaskAssigneeRepository assignees;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;

  public MembershipLeaveService(
      MemberRepository members,
      EventUserRepository eventUsers,
      MembershipTransferRepository transfers,
      TaskAssigneeRepository assignees,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock) {
    this.members = members;
    this.eventUsers = eventUsers;
    this.transfers = transfers;
    this.assignees = assignees;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
  }

  /** Same block order as {@link #leave}. A clear preview is not a guarantee on the later leave. */
  @Transactional(readOnly = true)
  public ErrorCode leavePreview(UUID spaceId, UUID userId) {
    if (members.countActive(spaceId, userId) == 0) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    return firstBlock(spaceId, userId, eventUsers.findOperated(spaceId, userId));
  }

  @Transactional
  public void leave(UUID spaceId, UUID userId, List<UUID> keepEventIds) {
    if (members.countActive(spaceId, userId) == 0) {
      throw new SceneException(ErrorCode.NOT_A_MEMBER);
    }
    List<OperatedEvent> events = eventUsers.findOperated(spaceId, userId);
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
      revokeEventAccess(spaceId, event.eventId(), userId, userId, LEAVE_REASON);
      if (event.handoverAccepted()
          && transfers.updateCompleted(spaceId, event.eventId(), userId) != 1) {
        throw new IllegalStateException("accepted handover was not completed");
      }
    }
    if (members.updateLeft(spaceId, userId) != 1) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
  }

  /**
   * Drops one event operator. Clears every task assigned to them, including DONE and CANCELLED,
   * records the override rows CASCADE would remove, then deletes {@code event_users}. {@code
   * userId} is the person who loses access. {@code actorUserId} is who did it: the person leaving,
   * or the caller of operator removal. {@code reason} is the task-audit text ({@code 이탈} or {@code
   * 운영자 제거}). The access-revoked detail keeps {@code userId} as the target. Kept events must not
   * call this.
   */
  public void revokeEventAccess(
      UUID spaceId, UUID eventId, UUID userId, UUID actorUserId, String reason) {
    if (eventUsers.findForUpdate(spaceId, eventId, userId).isEmpty()) {
      throw new IllegalStateException("event operator row was not locked");
    }
    List<AssignedTask> tasks = assignees.findForUpdate(spaceId, eventId, userId);
    if (assignees.updateCleared(spaceId, eventId, userId) != tasks.size()) {
      throw new IllegalStateException("assigned tasks were not cleared");
    }
    Instant occurredAt = clock.instant();
    for (AssignedTask task : tasks) {
      Map<String, Object> detail = new LinkedHashMap<>();
      detail.put("taskId", task.id());
      detail.put("previousAssigneeUserId", userId);
      detail.put("reason", reason);
      detail.put("version", task.version() + 1);
      audit(spaceId, eventId, actorUserId, AuditActions.TASK_ASSIGNEE_CLEARED, detail, occurredAt);
    }
    String snapshot = permissions.findSnapshot(spaceId, eventId, userId);
    if (eventUsers.delete(spaceId, eventId, userId) != 1) {
      throw new IllegalStateException("event operator row was not deleted");
    }
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("userId", userId);
    detail.put("deletedOverrides", json.readTree(snapshot));
    audit(spaceId, eventId, actorUserId, AuditActions.EVENT_ACCESS_REVOKED, detail, occurredAt);
  }

  private void audit(
      UUID spaceId,
      UUID eventId,
      UUID actorUserId,
      String action,
      Map<String, Object> detail,
      Instant occurredAt) {
    auditLogs.save(
        spaceId, eventId, actorUserId, action, json.writeValueAsString(detail), occurredAt);
  }

  private ErrorCode firstBlock(UUID spaceId, UUID userId, List<OperatedEvent> events) {
    if (transfers.countPendingFrom(spaceId, userId) > 0) {
      return ErrorCode.HANDOVER_NOT_ACCEPTED;
    }
    boolean onlySpaceOwner =
        members.countOtherOwners(spaceId, userId) == 0 && members.countOwners(spaceId, userId) > 0;
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
