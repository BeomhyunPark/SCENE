package app.scene.event.task;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.event.task.mapper.TaskMapper;
import app.scene.event.task.mapper.TaskQueryMapper;
import app.scene.event.task.param.OpenTaskQuery;
import app.scene.event.task.param.TaskCompleteUpdate;
import app.scene.event.task.param.TaskKey;
import app.scene.event.task.param.TaskReopenUpdate;
import app.scene.event.task.param.TaskStatusUpdate;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class TaskRepository {

  private static final String DONE = "DONE";
  private static final String DOING = "DOING";
  private static final List<String> OPEN = List.of("TODO", "DOING");

  private final TaskMapper tasks;
  private final TaskQueryMapper queries;

  public TaskRepository(TaskMapper tasks, TaskQueryMapper queries) {
    this.tasks = tasks;
    this.queries = queries;
  }

  public Optional<TaskRow> findForUpdate(UUID spaceId, UUID eventId, UUID taskId) {
    return Optional.ofNullable(queries.findForUpdate(TaskKey.of(spaceId, eventId, taskId)));
  }

  public TaskRow getForUpdate(UUID spaceId, UUID eventId, UUID taskId) {
    return findForUpdate(spaceId, eventId, taskId)
        .orElseThrow(() -> new SceneException(ErrorCode.RESOURCE_NOT_FOUND));
  }

  public int countOpen(UUID spaceId, UUID eventId) {
    return queries.countOpen(OpenTaskQuery.of(spaceId, eventId, OPEN));
  }

  @Transactional
  public int updateStatus(UUID spaceId, UUID eventId, UUID taskId, String status) {
    return tasks.updateStatus(TaskStatusUpdate.of(spaceId, eventId, taskId, status));
  }

  @Transactional
  public int updateCompleted(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      int version,
      UUID completedByUserId,
      Instant completedAt) {
    return tasks.updateCompleted(
        TaskCompleteUpdate.of(
            spaceId, eventId, taskId, version, completedByUserId, completedAt, DONE, OPEN));
  }

  @Transactional
  public int updateReopened(UUID spaceId, UUID eventId, UUID taskId, int version) {
    return tasks.updateReopened(
        TaskReopenUpdate.of(spaceId, eventId, taskId, version, DOING, DONE));
  }
}
