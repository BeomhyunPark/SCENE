package app.scene.event.task;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.permission.Permission;
import app.scene.common.permission.PermissionEvaluator;
import app.scene.event.lifecycle.EventRepository;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.lifecycle.OperatorActor;
import app.scene.space.EventUserPermissionRepository;
import app.scene.space.EventUserRepository;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * DEC-062 task create, patch, and delete. Create, patch, and delete require effective {@code
 * TASK_WRITE}. The assignee exception on check, complete, and reopen does not apply. Version is not
 * checked here. A title-only change does not increment it. Assignee set or clear, and a real change
 * to {@code CANCELLED}, increment it once. No audit action is written.
 */
@Service
public class TaskCommandService {

  private static final String ARCHIVED = "ARCHIVED";
  private static final String CANCELLED = "CANCELLED";

  private final EventRepository events;
  private final TaskRepository tasks;
  private final TaskChecklistItemRepository items;
  private final EventUserRepository eventUsers;
  private final EventUserPermissionRepository permissions;

  public TaskCommandService(
      EventRepository events,
      TaskRepository tasks,
      TaskChecklistItemRepository items,
      EventUserRepository eventUsers,
      EventUserPermissionRepository permissions) {
    this.events = events;
    this.tasks = tasks;
    this.items = items;
    this.eventUsers = eventUsers;
    this.permissions = permissions;
  }

  @Transactional
  public UUID create(
      UUID spaceId, UUID eventId, String title, UUID assigneeUserId, OperatorActor actor) {
    EventRow event = events.getForUpdate(spaceId, eventId);
    requireTaskWrite(spaceId, eventId, actor);
    requireWritable(event);
    if (assigneeUserId != null) {
      requireAssignee(spaceId, eventId, assigneeUserId);
    }
    UUID id = UUID.randomUUID();
    if (tasks.insert(id, spaceId, eventId, title, assigneeUserId) != 1) {
      throw new IllegalStateException("task insert did not write a row");
    }
    return id;
  }

  /**
   * Archive is judged before a same-value patch returns. An assignee lock is taken before the task
   * lock so operator removal, which locks the operator and then the assigned tasks, cannot deadlock
   * with this write.
   */
  @Transactional
  public void patch(UUID spaceId, UUID eventId, UUID taskId, TaskPatch patch, OperatorActor actor) {
    EventRow event = events.getForUpdate(spaceId, eventId);
    requireTaskWrite(spaceId, eventId, actor);
    requireWritable(event);
    if (patch.assigneePresent() && patch.assigneeUserId() != null) {
      requireAssignee(spaceId, eventId, patch.assigneeUserId());
    }
    TaskRow task = tasks.getForUpdate(spaceId, eventId, taskId);
    String nextTitle = patch.titlePresent() ? patch.title() : task.title();
    boolean titleChanged = patch.titlePresent() && !patch.title().equals(task.title());
    UUID nextAssignee = patch.assigneePresent() ? patch.assigneeUserId() : task.assigneeUserId();
    boolean assigneeChanged =
        patch.assigneePresent() && !Objects.equals(nextAssignee, task.assigneeUserId());
    String nextStatus = task.status();
    boolean statusChanged = false;
    if (patch.statusPresent()
        && CANCELLED.equals(patch.status())
        && !CANCELLED.equals(task.status())) {
      nextStatus = CANCELLED;
      statusChanged = true;
    }
    if (!titleChanged && !assigneeChanged && !statusChanged) {
      return;
    }
    int versionDelta = assigneeChanged || statusChanged ? 1 : 0;
    if (tasks.updateFields(
            spaceId, eventId, taskId, nextTitle, nextAssignee, nextStatus, versionDelta)
        != 1) {
      throw new IllegalStateException("task disappeared after it was locked");
    }
  }

  @Transactional
  public void delete(UUID spaceId, UUID eventId, UUID taskId, OperatorActor actor) {
    EventRow event = events.getForUpdate(spaceId, eventId);
    TaskRow task = tasks.getForUpdate(spaceId, eventId, taskId);
    requireTaskWrite(spaceId, eventId, actor);
    requireWritable(event);
    items.deleteByTask(spaceId, eventId, task.id());
    if (tasks.delete(spaceId, eventId, taskId) != 1) {
      throw new IllegalStateException("task disappeared after it was locked");
    }
  }

  /** Reads role and {@code TASK_WRITE} in this transaction. The actor's role is not trusted. */
  private void requireTaskWrite(UUID spaceId, UUID eventId, OperatorActor actor) {
    Optional<String> role = eventUsers.findRole(spaceId, eventId, actor.userId());
    if (role.isEmpty()) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    boolean allowed =
        PermissionEvaluator.allows(
            Permission.TASK_WRITE,
            role.get(),
            eventUsers.existsAuthorityEnded(spaceId, eventId, actor.userId()),
            permissions
                .findEffect(spaceId, eventId, actor.userId(), Permission.TASK_WRITE.name())
                .orElse(null));
    if (!allowed) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
  }

  private void requireAssignee(UUID spaceId, UUID eventId, UUID userId) {
    if (eventUsers.findRoleForUpdate(spaceId, eventId, userId).isEmpty()) {
      throw new SceneException(ErrorCode.VALIDATION_FAILED, Map.of("field", "assigneeUserId"));
    }
  }

  private static void requireWritable(EventRow event) {
    if (ARCHIVED.equals(event.lifecycleStatus())) {
      throw new SceneException(
          ErrorCode.EVENT_ARCHIVED, Map.of("eventStatus", event.lifecycleStatus()));
    }
  }
}
