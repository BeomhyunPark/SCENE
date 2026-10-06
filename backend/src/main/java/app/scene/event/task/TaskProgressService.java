package app.scene.event.task;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.TaskWrite;
import app.scene.event.lifecycle.OperatorActor;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * DEC-062 checklist writes. Judgment order is DEC-065: missing task or item, permission, archived
 * event, already-done or no-change, version, then task state.
 */
@Service
public class TaskProgressService {

  private final TaskProgressMapper mapper;
  private final JsonMapper json;
  private final Clock clock;

  public TaskProgressService(TaskProgressMapper mapper, JsonMapper json, Clock clock) {
    this.mapper = mapper;
    this.json = json;
    this.clock = clock;
  }

  @Transactional
  public TaskWriteResult setChecked(
      UUID spaceId, UUID eventId, UUID taskId, UUID itemId, boolean checked, OperatorActor actor) {
    TaskRow task = lock(spaceId, eventId, taskId);
    Boolean checkedNow = mapper.item(spaceId, eventId, taskId, itemId);
    if (checkedNow == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    authorize(spaceId, eventId, task, actor);
    if ("ARCHIVED".equals(task.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    ChecklistCounts counts = mapper.counts(spaceId, eventId, taskId);
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
    if (mapper.setChecked(spaceId, eventId, taskId, itemId, checked, checkedBy, checkedAt) != 1) {
      throw new IllegalStateException("checklist item disappeared after it was loaded");
    }
    String nextStatus = checked && "TODO".equals(task.status()) ? "DOING" : task.status();
    if (mapper.bump(spaceId, eventId, taskId, nextStatus) != 1) {
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
    return result("UPDATED", nextStatus, nextVersion, mapper.counts(spaceId, eventId, taskId));
  }

  @Transactional
  public TaskWriteResult complete(
      UUID spaceId, UUID eventId, UUID taskId, int version, OperatorActor actor) {
    TaskRow task = lock(spaceId, eventId, taskId);
    authorize(spaceId, eventId, task, actor);
    if ("ARCHIVED".equals(task.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    ChecklistCounts counts = mapper.counts(spaceId, eventId, taskId);
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
    if (mapper.complete(spaceId, eventId, taskId, version, actor.userId(), now) != 1) {
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
    TaskRow task = lock(spaceId, eventId, taskId);
    authorize(spaceId, eventId, task, actor);
    if ("ARCHIVED".equals(task.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    ChecklistCounts counts = mapper.counts(spaceId, eventId, taskId);
    if ("TODO".equals(task.status()) || "DOING".equals(task.status())) {
      return result("ALREADY_OPEN", task.status(), task.version(), counts);
    }
    if (task.version() != version) {
      throw new SceneException(ErrorCode.TASK_VERSION_CONFLICT);
    }
    if ("CANCELLED".equals(task.status())) {
      throw invalid("TASK_CANCELLED");
    }
    if (mapper.reopen(spaceId, eventId, taskId, version) != 1) {
      throw new IllegalStateException("task reopen did not update the locked row");
    }
    Instant now = clock.instant();
    int nextVersion = task.version() + 1;
    audit(
        spaceId,
        eventId,
        actor.userId(),
        "TASK_REOPENED",
        statusDetail(taskId, task.status(), task.version(), "DOING", nextVersion),
        now);
    return result("REOPENED", "DOING", nextVersion, counts);
  }

  private TaskRow lock(UUID spaceId, UUID eventId, UUID taskId) {
    TaskRow task = mapper.lock(spaceId, eventId, taskId);
    if (task == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    return task;
  }

  /** Reads role and TASK_WRITE in this transaction. The actor's role is not trusted. */
  private void authorize(UUID spaceId, UUID eventId, TaskRow task, OperatorActor actor) {
    String role = mapper.eventRole(spaceId, eventId, actor.userId());
    if (role == null) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    boolean assignee = actor.userId().equals(task.assigneeUserId());
    boolean taskWrite =
        TaskWrite.effective(role, mapper.taskWriteEffect(spaceId, eventId, actor.userId()));
    if (!assignee && !taskWrite) {
      throw new SceneException(ErrorCode.FORBIDDEN);
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
    mapper.audit(
        UUID.randomUUID(), spaceId, eventId, actorUserId, action, writeJson(detail), occurredAt);
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
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("taskId", taskId);
    detail.put("before", state(null, statusBefore, versionBefore));
    detail.put("after", state(null, statusAfter, versionAfter));
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
