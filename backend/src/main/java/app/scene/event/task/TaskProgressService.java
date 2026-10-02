package app.scene.event.task;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.lifecycle.OperatorActor;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** DEC-062 checklist writes. ARCHIVED is the only event status that blocks them (DEC-063). */
@Service
public class TaskProgressService {

  private final TaskProgressMapper mapper;

  public TaskProgressService(TaskProgressMapper mapper) {
    this.mapper = mapper;
  }

  @Transactional
  public void setChecked(
      UUID spaceId, UUID taskId, UUID itemId, boolean checked, OperatorActor actor) {
    TaskRow task = lockWritable(spaceId, taskId, actor);
    if (mapper.setChecked(taskId, itemId, checked) != 1) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if (checked && "TODO".equals(task.status())) {
      mapper.markDoing(taskId);
    }
  }

  @Transactional
  public void complete(UUID spaceId, UUID taskId, int version, OperatorActor actor) {
    TaskRow task = lockWritable(spaceId, taskId, actor);
    requireVersion(task, version);
    if (mapper.uncheckedCount(taskId) > 0) {
      throw new SceneException(ErrorCode.INVALID_TASK_STATE);
    }
    if (mapper.complete(taskId, version) != 1) {
      throw new SceneException(ErrorCode.TASK_VERSION_CONFLICT);
    }
  }

  @Transactional
  public void reopen(UUID spaceId, UUID taskId, int version, OperatorActor actor) {
    TaskRow task = lockWritable(spaceId, taskId, actor);
    requireVersion(task, version);
    if (!"DONE".equals(task.status())) {
      throw new SceneException(ErrorCode.INVALID_TASK_STATE);
    }
    if (mapper.reopen(taskId, version) != 1) {
      throw new SceneException(ErrorCode.TASK_VERSION_CONFLICT);
    }
  }

  private TaskRow lockWritable(UUID spaceId, UUID taskId, OperatorActor actor) {
    TaskRow task = mapper.lock(spaceId, taskId);
    if (task == null) {
      throw new SceneException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    if ("ARCHIVED".equals(task.lifecycleStatus())) {
      throw new SceneException(ErrorCode.EVENT_ARCHIVED);
    }
    boolean assignee = actor.userId().equals(task.assigneeUserId());
    boolean taskWrite = actor.eventOwner() || "MANAGER".equals(actor.eventRole());
    if (!assignee && !taskWrite) {
      throw new SceneException(ErrorCode.FORBIDDEN);
    }
    return task;
  }

  private static void requireVersion(TaskRow task, int version) {
    if (task.version() != version) {
      throw new SceneException(ErrorCode.TASK_VERSION_CONFLICT);
    }
  }
}
