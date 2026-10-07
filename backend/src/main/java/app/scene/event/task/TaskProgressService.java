package app.scene.event.task;

import app.scene.common.audit.AuditLogRepository;
import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.lifecycle.OperatorActor;
import app.scene.space.EventUserPermissionRepository;
import app.scene.space.EventUserRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * DEC-062 checklist writes. Judgment order is DEC-065: missing task or item, permission, request
 * values, archived event, already-done or no-change, version, then task state.
 */
@Service
public class TaskProgressService {

  private static final String TASK_WRITE = "TASK_WRITE";
  private static final int REASON_MAX = 500;

  private final TaskRepository tasks;
  private final TaskChecklistItemRepository items;
  private final EventUserRepository eventUsers;
  private final EventUserPermissionRepository permissions;
  private final AuditLogRepository auditLogs;
  private final JsonMapper json;
  private final Clock clock;

  public TaskProgressService(
      TaskRepository tasks,
      TaskChecklistItemRepository items,
      EventUserRepository eventUsers,
      EventUserPermissionRepository permissions,
      AuditLogRepository auditLogs,
      JsonMapper json,
      Clock clock) {
    this.tasks = tasks;
    this.items = items;
    this.eventUsers = eventUsers;
    this.permissions = permissions;
    this.auditLogs = auditLogs;
    this.json = json;
    this.clock = clock;
  }

  @Transactional
  public TaskWriteResult setChecked(
      UUID spaceId, UUID eventId, UUID taskId, UUID itemId, boolean checked, OperatorActor actor) {
    return setChecked(spaceId, eventId, taskId, itemId, Boolean.valueOf(checked), null, actor);
  }

  @Transactional
  public TaskWriteResult setChecked(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      UUID itemId,
      Boolean checked,
      String invalidField,
      OperatorActor actor) {
    TaskRow task = tasks.getForUpdate(spaceId, eventId, taskId);
    Optional<Boolean> stored = items.findChecked(spaceId, eventId, taskId, itemId);
    if (stored.isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    boolean checkedNow = stored.get();
    authorize(spaceId, eventId, task, actor);
    rejectRequest(invalidField);
    if (checked == null) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "checked"));
    }
    if ("ARCHIVED".equals(task.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    ChecklistCounts counts = items.count(spaceId, eventId, taskId);
    if (checkedNow == checked) {
      return result("NO_CHANGE", task.status(), task.version(), counts);
    }
    if ("DONE".equals(task.status())) {
      throw invalid("TASK_DONE");
    }
    if ("CANCELLED".equals(task.status())) {
      throw invalid("TASK_CANCELLED");
    }
    Instant now = clock.instant();
    UUID checkedBy = checked ? actor.userId() : null;
    Instant checkedAt = checked ? now : null;
    if (items.updateChecked(spaceId, eventId, taskId, itemId, checked, checkedBy, checkedAt) != 1) {
      throw new IllegalStateException("checklist item disappeared after it was loaded");
    }
    String nextStatus = checked && "TODO".equals(task.status()) ? "DOING" : task.status();
    if (tasks.updateStatus(spaceId, eventId, taskId, nextStatus) != 1) {
      throw new IllegalStateException("task disappeared after it was locked");
    }
    int nextVersion = task.version() + 1;
    audit(
        spaceId,
        eventId,
        actor.userId(),
        checked ? "TASK_ITEM_CHECKED" : "TASK_ITEM_UNCHECKED",
        itemDetail(
            taskId,
            itemId,
            checkedNow,
            task.status(),
            task.version(),
            checked,
            nextStatus,
            nextVersion),
        now);
    return result("UPDATED", nextStatus, nextVersion, items.count(spaceId, eventId, taskId));
  }

  @Transactional
  public TaskWriteResult complete(
      UUID spaceId, UUID eventId, UUID taskId, int version, OperatorActor actor) {
    return complete(spaceId, eventId, taskId, Integer.valueOf(version), null, actor);
  }

  @Transactional
  public TaskWriteResult complete(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      Integer version,
      String invalidField,
      OperatorActor actor) {
    TaskRow task = tasks.getForUpdate(spaceId, eventId, taskId);
    authorize(spaceId, eventId, task, actor);
    rejectRequest(invalidField);
    if (version == null) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "version"));
    }
    if ("ARCHIVED".equals(task.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    ChecklistCounts counts = items.count(spaceId, eventId, taskId);
    if ("DONE".equals(task.status())) {
      return result("ALREADY_DONE", task.status(), task.version(), counts);
    }
    if (task.version() != version) {
      throw new SceneException(ErrorCode.TASK_VERSION_CONFLICT);
    }
    if ("CANCELLED".equals(task.status())) {
      throw invalid("TASK_CANCELLED");
    }
    if (counts.done() != counts.total()) {
      throw invalid("CHECKLIST_INCOMPLETE");
    }
    Instant now = clock.instant();
    if (tasks.updateCompleted(spaceId, eventId, taskId, version, actor.userId(), now) != 1) {
      throw new IllegalStateException("task complete did not update the locked row");
    }
    int nextVersion = task.version() + 1;
    audit(
        spaceId,
        eventId,
        actor.userId(),
        "TASK_COMPLETED",
        statusDetail(taskId, task.status(), task.version(), "DONE", nextVersion),
        now);
    return result("COMPLETED", "DONE", nextVersion, counts);
  }

  @Transactional
  public TaskWriteResult reopen(
      UUID spaceId, UUID eventId, UUID taskId, int version, OperatorActor actor) {
    return reopen(spaceId, eventId, taskId, Integer.valueOf(version), null, null, actor);
  }

  @Transactional
  public TaskWriteResult reopen(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      Integer version,
      String reason,
      String invalidField,
      OperatorActor actor) {
    TaskRow task = tasks.getForUpdate(spaceId, eventId, taskId);
    authorize(spaceId, eventId, task, actor);
    rejectRequest(invalidField);
    if (version == null) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "version"));
    }
    if (reason != null && reason.length() > REASON_MAX) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "reason"));
    }
    if ("ARCHIVED".equals(task.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    ChecklistCounts counts = items.count(spaceId, eventId, taskId);
    if ("TODO".equals(task.status()) || "DOING".equals(task.status())) {
      return result("ALREADY_OPEN", task.status(), task.version(), counts);
    }
    if (task.version() != version) {
      throw new SceneException(ErrorCode.TASK_VERSION_CONFLICT);
    }
    if ("CANCELLED".equals(task.status())) {
      throw invalid("TASK_CANCELLED");
    }
    if (tasks.updateReopened(spaceId, eventId, taskId, version) != 1) {
      throw new IllegalStateException("task reopen did not update the locked row");
    }
    Instant now = clock.instant();
    int nextVersion = task.version() + 1;
    audit(
        spaceId,
        eventId,
        actor.userId(),
        "TASK_REOPENED",
        statusDetail(taskId, task.status(), task.version(), "DOING", nextVersion, reason),
        now);
    return result("REOPENED", "DOING", nextVersion, counts);
  }

  /** Reads role and TASK_WRITE in this transaction. The actor's role is not trusted. */
  private void authorize(UUID spaceId, UUID eventId, TaskRow task, OperatorActor actor) {
    Optional<String> role = eventUsers.findRole(spaceId, eventId, actor.userId());
    if (role.isEmpty()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    boolean assignee = actor.userId().equals(task.assigneeUserId());
    boolean taskWrite =
        PermissionEvaluator.allows(
            Permission.TASK_WRITE,
            role.get(),
            eventUsers.existsAuthorityEnded(spaceId, eventId, actor.userId()),
            permissions.findEffect(spaceId, eventId, actor.userId(), TASK_WRITE).orElse(null));
    if (!assignee && !taskWrite) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
  }

  private static void rejectRequest(String invalidField) {
    if (invalidField != null) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", invalidField));
    }
  }

  private static SceneException invalid(String reason) {
    return new SceneException(ErrorCode.INVALID_TASK_STATE, Map.of("reason", reason));
  }

  private static TaskWriteResult result(
      String outcome, String status, int version, ChecklistCounts counts) {
    return new TaskWriteResult(outcome, status, version, counts.done(), counts.total());
  }

  private void audit(
      UUID spaceId,
      UUID eventId,
      UUID actorUserId,
      String action,
      Map<String, Object> detail,
      Instant occurredAt) {
    auditLogs.save(spaceId, eventId, actorUserId, action, writeJson(detail), occurredAt);
  }

  private Map<String, Object> itemDetail(
      UUID taskId,
      UUID itemId,
      boolean checkedBefore,
      String statusBefore,
      int versionBefore,
      boolean checkedAfter,
      String statusAfter,
      int versionAfter) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("taskId", taskId);
    detail.put("itemId", itemId);
    detail.put("before", state(checkedBefore, statusBefore, versionBefore));
    detail.put("after", state(checkedAfter, statusAfter, versionAfter));
    return detail;
  }

  private Map<String, Object> statusDetail(
      UUID taskId, String statusBefore, int versionBefore, String statusAfter, int versionAfter) {
    return statusDetail(taskId, statusBefore, versionBefore, statusAfter, versionAfter, null);
  }

  private Map<String, Object> statusDetail(
      UUID taskId,
      String statusBefore,
      int versionBefore,
      String statusAfter,
      int versionAfter,
      String reason) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("taskId", taskId);
    detail.put("before", state(null, statusBefore, versionBefore));
    detail.put("after", state(null, statusAfter, versionAfter));
    if (reason != null && !reason.isBlank()) {
      detail.put("reason", reason);
    }
    return detail;
  }

  private static Map<String, Object> state(Boolean checked, String status, int version) {
    Map<String, Object> state = new LinkedHashMap<>();
    if (checked != null) {
      state.put("checked", checked);
    }
    state.put("status", status);
    state.put("version", version);
    return state;
  }

  private String writeJson(Map<String, Object> detail) {
    return json.writeValueAsString(detail);
  }
}
