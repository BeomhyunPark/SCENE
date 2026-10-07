package app.scene.event.task;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.common.tenant.SpaceMembership;
import app.scene.common.web.ItemPage;
import app.scene.common.web.PageRequest;
import app.scene.common.web.Sorts;
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
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * Task command HTTP on {@link TaskCommandService}. This class resolves the event and shapes the
 * response. It does not insert, patch, or delete on its own. A 409 body is read after the command
 * transaction rolls back, so these methods stay non-transactional. {@code Idempotency-Key} is not
 * read. List filters {@code assignee} and {@code status} are proposals and are not applied.
 */
@Service
public class OperatorTaskCommandService {

  private static final int TITLE_MAX = 200;
  private static final String CANCELLED = "CANCELLED";

  private final EventAccessGate gate;
  private final TaskCommandService commands;
  private final TaskRepository tasks;
  private final TaskChecklistItemRepository items;
  private final EventUserRepository eventUsers;
  private final EventUserPermissionRepository permissions;
  private final OperatorAccountRepository accounts;

  public OperatorTaskCommandService(
      EventAccessGate gate,
      TaskCommandService commands,
      TaskRepository tasks,
      TaskChecklistItemRepository items,
      EventUserRepository eventUsers,
      EventUserPermissionRepository permissions,
      OperatorAccountRepository accounts) {
    this.gate = gate;
    this.commands = commands;
    this.tasks = tasks;
    this.items = items;
    this.eventUsers = eventUsers;
    this.permissions = permissions;
    this.accounts = accounts;
  }

  public ItemPage<TaskListItem> list(
      UUID actorId, UUID eventId, Integer page, Integer size, List<String> sort) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    PageRequest request = PageRequest.of(page, size);
    Sorts.parse(sort, Set.of());
    UUID spaceId = opened.location().spaceId();
    long total = tasks.count(spaceId, eventId);
    List<TaskListItem> items = new ArrayList<>();
    for (TaskListRow row : tasks.list(spaceId, eventId, request)) {
      items.add(
          new TaskListItem(
              row.taskId(),
              row.title(),
              row.status(),
              row.assigneeUserId(),
              row.assigneeDisplayName(),
              new TaskListItem.Checklist(row.done(), row.total()),
              row.version()));
    }
    return ItemPage.of(items, request, total);
  }

  public TaskCommandResponse detail(UUID actorId, UUID eventId, UUID taskId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (tasks.find(spaceId, eventId, taskId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (!mayRead(opened, actorId)) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return required(spaceId, eventId, taskId, gate.actor(actorId, opened));
  }

  public TaskCommandResponse create(UUID actorId, UUID eventId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    requireTaskWrite(opened, actorId);
    ParsedCreate parsed = parseCreate(body);
    UUID spaceId = opened.location().spaceId();
    if (parsed.assigneeUserId() != null) {
      requireAssignee(spaceId, eventId, parsed.assigneeUserId());
    }
    OperatorActor actor = gate.actor(actorId, opened);
    UUID taskId;
    try {
      taskId = commands.create(spaceId, eventId, parsed.title(), parsed.assigneeUserId(), actor);
    } catch (SceneException exception) {
      throw attachTask(exception, spaceId, eventId, null, actor);
    } catch (DataIntegrityViolationException exception) {
      throw assigneeConstraint(exception);
    }
    return required(spaceId, eventId, taskId, actor);
  }

  public TaskCommandResponse patch(UUID actorId, UUID eventId, UUID taskId, JsonNode body) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (tasks.find(spaceId, eventId, taskId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    requireTaskWrite(opened, actorId);
    TaskPatch patch = parsePatch(body);
    if (patch.assigneePresent() && patch.assigneeUserId() != null) {
      requireAssignee(spaceId, eventId, patch.assigneeUserId());
    }
    OperatorActor actor = gate.actor(actorId, opened);
    try {
      commands.patch(spaceId, eventId, taskId, patch, actor);
    } catch (SceneException exception) {
      throw attachTask(exception, spaceId, eventId, taskId, actor);
    } catch (DataIntegrityViolationException exception) {
      throw assigneeConstraint(exception);
    }
    return required(spaceId, eventId, taskId, actor);
  }

  public void delete(UUID actorId, UUID eventId, UUID taskId) {
    EventAccessGate.Opened opened = gate.open(actorId, eventId);
    UUID spaceId = opened.location().spaceId();
    if (tasks.find(spaceId, eventId, taskId).isEmpty()) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    requireTaskWrite(opened, actorId);
    OperatorActor actor = gate.actor(actorId, opened);
    try {
      commands.delete(spaceId, eventId, taskId, actor);
    } catch (SceneException exception) {
      throw attachTask(exception, spaceId, eventId, taskId, actor);
    }
  }

  /**
   * Effective {@code EVENT_READ}, or an active space membership whose role is OWNER or ADMIN. This
   * does not widen lifecycle reads, which allow a space owner only.
   */
  private boolean mayRead(EventAccessGate.Opened opened, UUID actorId) {
    UUID spaceId = opened.location().spaceId();
    UUID eventId = opened.location().id();
    if (opened.eventRole() != null) {
      String effect =
          permissions
              .findEffect(spaceId, eventId, actorId, Permission.EVENT_READ.name())
              .orElse(null);
      if (PermissionEvaluator.allows(
          Permission.EVENT_READ, opened.eventRole(), opened.authorityEnded(), effect)) {
        return true;
      }
    }
    SpaceMembership membership = opened.membership();
    return membership.kind() == SpaceMembership.Kind.ACTIVE
        && ("OWNER".equals(membership.role()) || "ADMIN".equals(membership.role()));
  }

  private void requireTaskWrite(EventAccessGate.Opened opened, UUID actorId) {
    UUID spaceId = opened.location().spaceId();
    UUID eventId = opened.location().id();
    String effect =
        permissions
            .findEffect(spaceId, eventId, actorId, Permission.TASK_WRITE.name())
            .orElse(null);
    boolean allowed =
        opened.eventRole() != null
            && PermissionEvaluator.allows(
                Permission.TASK_WRITE, opened.eventRole(), opened.authorityEnded(), effect);
    if (!allowed) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
  }

  private void requireAssignee(UUID spaceId, UUID eventId, UUID userId) {
    if (eventUsers.findRole(spaceId, eventId, userId).isEmpty()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "assigneeUserId"));
    }
  }

  private TaskCommandResponse required(
      UUID spaceId, UUID eventId, UUID taskId, OperatorActor actor) {
    return view(spaceId, eventId, taskId, actor)
        .map(CommandView::response)
        .orElseThrow(() -> new IllegalStateException("task disappeared after it was written"));
  }

  /**
   * Attaches the current task to a 409. The embedded task matches the progress 409 shape: no {@code
   * title}, no {@code outcome}. A create that fails before a row exists leaves {@code task} off and
   * keeps {@code eventStatus}.
   */
  private SceneException attachTask(
      SceneException exception, UUID spaceId, UUID eventId, UUID taskId, OperatorActor actor) {
    ErrorCode code = exception.code();
    if (code != ErrorCode.EVENT_ARCHIVED
        && code != ErrorCode.TASK_VERSION_CONFLICT
        && code != ErrorCode.INVALID_TASK_STATE) {
      return exception;
    }
    Map<String, Object> details = new LinkedHashMap<>(exception.details());
    if (taskId == null) {
      return new SceneException(code, details);
    }
    Optional<CommandView> state = view(spaceId, eventId, taskId, actor);
    if (state.isEmpty()) {
      return new SceneException(code, details);
    }
    if (code == ErrorCode.EVENT_ARCHIVED) {
      details.putIfAbsent("eventStatus", state.get().lifecycleStatus());
    }
    details.put("task", taskMap(state.get().response()));
    return new SceneException(code, details);
  }

  private Optional<CommandView> view(UUID spaceId, UUID eventId, UUID taskId, OperatorActor actor) {
    Optional<TaskRow> found = tasks.find(spaceId, eventId, taskId);
    if (found.isEmpty()) {
      return Optional.empty();
    }
    TaskRow task = found.get();
    TaskStateResponse.Checklist checklist = checklist(spaceId, eventId, taskId);
    boolean canWrite = canWrite(spaceId, eventId, task, actor);
    TaskCommandResponse response =
        new TaskCommandResponse(
            task.id(),
            task.title(),
            task.status(),
            task.version(),
            checklist,
            task.assigneeUserId(),
            displayName(task.assigneeUserId()),
            task.completedByUserId(),
            displayName(task.completedByUserId()),
            task.completedAt(),
            actions(task, checklist, canWrite),
            null);
    return Optional.of(new CommandView(response, task.lifecycleStatus()));
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
    boolean cancelled = CANCELLED.equals(task.status());
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

  /** Progress 409 task. {@code title} and {@code outcome} are omitted. */
  private static Map<String, Object> taskMap(TaskCommandResponse state) {
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

  /** {@code get} keeps a JSON null. {@code has} treats that null as absent. */
  private static ParsedCreate parseCreate(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw field("title");
    }
    JsonNode titleNode = body.get("title");
    if (titleNode == null || titleNode.isNull() || !titleNode.isString()) {
      throw field("title");
    }
    String title = titleNode.asString().strip();
    if (title.isEmpty() || title.length() > TITLE_MAX) {
      throw field("title");
    }
    UUID assignee = null;
    JsonNode assigneeNode = body.get("assigneeUserId");
    if (assigneeNode != null && !assigneeNode.isNull()) {
      assignee = uuid(assigneeNode, "assigneeUserId");
    }
    return new ParsedCreate(title, assignee);
  }

  /** First failing field wins: title, assignee, then status. {@code version} is ignored. */
  private static TaskPatch parsePatch(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED);
    }
    boolean titlePresent = false;
    String title = null;
    JsonNode titleNode = body.get("title");
    if (titleNode != null) {
      titlePresent = true;
      if (titleNode.isNull() || !titleNode.isString()) {
        throw field("title");
      }
      title = titleNode.asString().strip();
      if (title.isEmpty() || title.length() > TITLE_MAX) {
        throw field("title");
      }
    }
    boolean assigneePresent = false;
    UUID assignee = null;
    JsonNode assigneeNode = body.get("assigneeUserId");
    if (assigneeNode != null) {
      assigneePresent = true;
      if (!assigneeNode.isNull()) {
        assignee = uuid(assigneeNode, "assigneeUserId");
      }
    }
    boolean statusPresent = false;
    String status = null;
    JsonNode statusNode = body.get("status");
    if (statusNode != null) {
      statusPresent = true;
      if (statusNode.isNull()
          || !statusNode.isString()
          || !CANCELLED.equals(statusNode.asString())) {
        throw field("status");
      }
      status = CANCELLED;
    }
    return new TaskPatch(titlePresent, title, assigneePresent, assignee, statusPresent, status);
  }

  private static UUID uuid(JsonNode node, String name) {
    if (!node.isString()) {
      throw field(name);
    }
    try {
      return UUID.fromString(node.asString());
    } catch (IllegalArgumentException exception) {
      throw field(name);
    }
  }

  private static SceneException field(String name) {
    return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", name));
  }

  private static RuntimeException assigneeConstraint(DataIntegrityViolationException exception) {
    Throwable cause = exception.getMostSpecificCause();
    String message = cause.getMessage();
    if (message != null && message.contains("assignee_user_id")) {
      return new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "assigneeUserId"));
    }
    return exception;
  }

  private record ParsedCreate(String title, UUID assigneeUserId) {}

  private record CommandView(TaskCommandResponse response, String lifecycleStatus) {}
}
