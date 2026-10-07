package app.scene.event.task;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.lifecycle.EventAccessGate;
import app.scene.event.lifecycle.OperatorActor;
import app.scene.identity.OperatorAccountRepository;
import app.scene.space.EventUserPermissionRepository;
import app.scene.space.EventUserRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * Task progress HTTP on {@link TaskProgressService}. This class resolves the event and shapes the
 * response. It does not check, complete, or reopen on its own. A 409 body is read after the command
 * transaction rolls back, so these methods stay non-transactional. {@code PATCH /tasks/{taskId}}
 * and {@code GET /tasks} are not created here. {@code Idempotency-Key} is not read.
 */
@Service
public class OperatorTaskProgressService {

  private final EventAccessGate gate;
  private final TaskProgressService progress;
  private final TaskRepository tasks;
  private final TaskChecklistItemRepository items;
  private final EventUserRepository eventUsers;
  private final EventUserPermissionRepository permissions;
  private final OperatorAccountRepository accounts;

  public OperatorTaskProgressService(
      EventAccessGate gate,
      TaskProgressService progress,
      TaskRepository tasks,
      TaskChecklistItemRepository items,
      EventUserRepository eventUsers,
      EventUserPermissionRepository permissions,
      OperatorAccountRepository accounts) {
    this.gate = gate;
    this.progress = progress;
    this.tasks = tasks;
    this.items = items;
    this.eventUsers = eventUsers;
    this.permissions = permissions;
    this.accounts = accounts;
  }

  public TaskStateResponse setChecked(
      UUID actorId, UUID eventId, UUID taskId, UUID itemId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    ParsedCheck parsed = parseChecked(body);
    return run(
        opened,
        actorId,
        taskId,
        () ->
            progress.setChecked(
                opened.location().spaceId(),
                eventId,
                taskId,
                itemId,
                parsed.checked(),
                parsed.invalidField(),
                gate.actor(actorId, opened)));
  }

  public TaskStateResponse complete(UUID actorId, UUID eventId, UUID taskId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    ParsedCommand parsed = parseCommand(body, false);
    return run(
        opened,
        actorId,
        taskId,
        () ->
            progress.complete(
                opened.location().spaceId(),
                eventId,
                taskId,
                parsed.version(),
                parsed.invalidField(),
                gate.actor(actorId, opened)));
  }

  public TaskStateResponse reopen(UUID actorId, UUID eventId, UUID taskId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    ParsedCommand parsed = parseCommand(body, true);
    return run(
        opened,
        actorId,
        taskId,
        () ->
            progress.reopen(
                opened.location().spaceId(),
                eventId,
                taskId,
                parsed.version(),
                parsed.reason(),
                parsed.invalidField(),
                gate.actor(actorId, opened)));
  }

  private TaskStateResponse run(
      EventAccessGate.Opened opened, UUID actorId, UUID taskId, Supplier<TaskWriteResult> command) {
    UUID spaceId = opened.location().spaceId();
    UUID eventId = opened.location().id();
    OperatorActor actor = gate.actor(actorId, opened);
    try {
      TaskWriteResult result = command.get();
      return view(spaceId, eventId, taskId, actor, result.outcome())
          .map(TaskView::response)
          .orElseThrow(() -> new IllegalStateException("task disappeared after it was updated"));
    } catch (SceneException exception) {
      throw attachTask(exception, spaceId, eventId, taskId, actor);
    }
  }

  /**
   * Attaches the current task to a 409. A missing item stays a bare 404: the contract marks that
   * attachment as a proposal. The read runs after the command transaction has rolled back.
   */
  private SceneException attachTask(
      SceneException exception, UUID spaceId, UUID eventId, UUID taskId, OperatorActor actor) {
    ErrorCode code = exception.code();
    if (code != ErrorCode.EVENT_ARCHIVED
        && code != ErrorCode.TASK_VERSION_CONFLICT
        && code != ErrorCode.INVALID_TASK_STATE) {
      return exception;
    }
    Optional<TaskView> state = view(spaceId, eventId, taskId, actor, null);
    if (state.isEmpty()) {
      return exception;
    }
    Map<String, Object> details = new LinkedHashMap<>(exception.details());
    if (code == ErrorCode.EVENT_ARCHIVED) {
      details.put("eventStatus", state.get().lifecycleStatus());
    }
    details.put("task", taskMap(state.get().response()));
    return new SceneException(code, details);
  }

  private Optional<TaskView> view(
      UUID spaceId, UUID eventId, UUID taskId, OperatorActor actor, String outcome) {
    Optional<TaskRow> found = tasks.find(spaceId, eventId, taskId);
    if (found.isEmpty()) {
      return Optional.empty();
    }
    TaskRow task = found.get();
    TaskStateResponse.Checklist checklist = checklist(spaceId, eventId, taskId);
    boolean canWrite = canWrite(spaceId, eventId, task, actor);
    TaskStateResponse response =
        new TaskStateResponse(
            task.id(),
            task.status(),
            task.version(),
            checklist,
            task.assigneeUserId(),
            displayName(task.assigneeUserId()),
            task.completedByUserId(),
            displayName(task.completedByUserId()),
            task.completedAt(),
            actions(task, checklist, canWrite),
            outcome);
    return Optional.of(new TaskView(response, task.lifecycleStatus()));
  }

  private TaskStateResponse.Checklist checklist(UUID spaceId, UUID eventId, UUID taskId) {
    List<ChecklistItemRow> rows = items.findAll(spaceId, eventId, taskId);
    int done = 0;
    List<TaskStateResponse.Item> views = new ArrayList<>();
    for (ChecklistItemRow row : rows) {
      if (row.checked()) {
        done++;
      }
      views.add(
          new TaskStateResponse.Item(
              row.id(),
              row.label(),
              row.position(),
              row.checked(),
              row.checkedByUserId(),
              row.checkedByDisplayName(),
              row.checkedAt()));
    }
    return new TaskStateResponse.Checklist(done, rows.size(), views);
  }

  private boolean canWrite(UUID spaceId, UUID eventId, TaskRow task, OperatorActor actor) {
    Optional<String> role = eventUsers.findRole(spaceId, eventId, actor.userId());
    if (role.isEmpty()) {
      return false;
    }
    boolean assignee = actor.userId().equals(task.assigneeUserId());
    boolean taskWrite =
        PermissionEvaluator.allows(
            Permission.TASK_WRITE,
            role.get(),
            eventUsers.existsAuthorityEnded(spaceId, eventId, actor.userId()),
            permissions
                .findEffect(spaceId, eventId, actor.userId(), Permission.TASK_WRITE.name())
                .orElse(null));
    return assignee || taskWrite;
  }

  /**
   * One reason for the disabled actions. Archived, cancelled, and done block before an incomplete
   * checklist. A caller who cannot write sees {@code FORBIDDEN}.
   */
  private static TaskStateResponse.Actions actions(
      TaskRow task, TaskStateResponse.Checklist checklist, boolean canWrite) {
    boolean archived = "ARCHIVED".equals(task.lifecycleStatus());
    boolean cancelled = "CANCELLED".equals(task.status());
    boolean done = "DONE".equals(task.status());
    boolean complete = checklist.done() == checklist.total();
    boolean canCheck = canWrite && !archived && !cancelled && !done;
    boolean canComplete = canCheck && complete;
    boolean canReopen = canWrite && !archived && done;
    String blocked;
    if (!canWrite) {
      blocked = "FORBIDDEN";
    } else if (archived) {
      blocked = "EVENT_ARCHIVED";
    } else if (cancelled) {
      blocked = "TASK_CANCELLED";
    } else if (done) {
      blocked = "TASK_DONE";
    } else if (!complete) {
      blocked = "CHECKLIST_INCOMPLETE";
    } else {
      blocked = null;
    }
    return new TaskStateResponse.Actions(canCheck, canComplete, canReopen, blocked);
  }

  private String displayName(UUID userId) {
    if (userId == null) {
      return null;
    }
    return accounts.findById(userId).map(account -> account.displayName()).orElse(null);
  }

  private static Map<String, Object> taskMap(TaskStateResponse state) {
    List<Map<String, Object>> itemMaps = new ArrayList<>();
    for (TaskStateResponse.Item item : state.checklist().items()) {
      Map<String, Object> one = new LinkedHashMap<>();
      one.put("itemId", item.itemId());
      one.put("label", item.label());
      one.put("position", item.position());
      one.put("checked", item.checked());
      one.put("checkedByUserId", item.checkedByUserId());
      one.put("checkedByDisplayName", item.checkedByDisplayName());
      one.put("checkedAt", item.checkedAt());
      itemMaps.add(one);
    }
    Map<String, Object> checklist = new LinkedHashMap<>();
    checklist.put("done", state.checklist().done());
    checklist.put("total", state.checklist().total());
    checklist.put("items", itemMaps);
    Map<String, Object> actions = new LinkedHashMap<>();
    actions.put("canCheck", state.actions().canCheck());
    actions.put("canComplete", state.actions().canComplete());
    actions.put("canReopen", state.actions().canReopen());
    actions.put("blockedReason", state.actions().blockedReason());
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("taskId", state.taskId());
    body.put("status", state.status());
    body.put("version", state.version());
    body.put("checklist", checklist);
    body.put("assigneeUserId", state.assigneeUserId());
    body.put("assigneeDisplayName", state.assigneeDisplayName());
    body.put("completedByUserId", state.completedByUserId());
    body.put("completedByDisplayName", state.completedByDisplayName());
    body.put("completedAt", state.completedAt());
    body.put("actions", actions);
    return body;
  }

  private static ParsedCheck parseChecked(JsonNode body) {
    if (body == null || body.isNull()) {
      return new ParsedCheck(null, null);
    }
    if (!body.isObject()) {
      return new ParsedCheck(null, "checked");
    }
    JsonNode checked = body.get("checked");
    if (checked == null || checked.isNull()) {
      return new ParsedCheck(null, null);
    }
    if (!checked.isBoolean()) {
      return new ParsedCheck(null, "checked");
    }
    return new ParsedCheck(checked.booleanValue(), null);
  }

  /** {@code reason} is read only for reopen. The first type error wins, version then reason. */
  private static ParsedCommand parseCommand(JsonNode body, boolean withReason) {
    if (body == null || body.isNull()) {
      return new ParsedCommand(null, null, null);
    }
    if (!body.isObject()) {
      return new ParsedCommand(null, null, "version");
    }
    JsonNode versionNode = body.get("version");
    Integer version = null;
    String invalid = null;
    if (versionNode != null && !versionNode.isNull()) {
      if (versionNode.isIntegralNumber()
          && versionNode.longValue() >= Integer.MIN_VALUE
          && versionNode.longValue() <= Integer.MAX_VALUE) {
        version = versionNode.intValue();
      } else {
        invalid = "version";
      }
    }
    String reason = null;
    if (withReason) {
      JsonNode reasonNode = body.get("reason");
      if (reasonNode != null && !reasonNode.isNull()) {
        if (reasonNode.isString()) {
          reason = reasonNode.asString();
        } else if (invalid == null) {
          invalid = "reason";
        }
      }
    }
    return new ParsedCommand(version, reason, invalid);
  }

  private record TaskView(TaskStateResponse response, String lifecycleStatus) {}

  private record ParsedCheck(Boolean checked, String invalidField) {}

  private record ParsedCommand(Integer version, String reason, String invalidField) {}
}
