package app.scene.event.task;

import app.scene.common.error.ErrorCode;
import app.scene.common.error.SceneException;
import app.scene.common.mybatis.PageParam;
import app.scene.common.web.PageRequest;
import app.scene.event.task.mapper.TaskMapper;
import app.scene.event.task.mapper.TaskQueryMapper;
import app.scene.event.task.param.OpenTaskQuery;
import app.scene.event.task.param.TaskCompleteUpdate;
import app.scene.event.task.param.TaskEventKey;
import app.scene.event.task.param.TaskFieldUpdate;
import app.scene.event.task.param.TaskInsert;
import app.scene.event.task.param.TaskKey;
import app.scene.event.task.param.TaskListQuery;
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

  /** The task section confirms no sort field, so the list order is not client text. */
  static final String LIST_ORDER = "t.id ASC";

  private static final String DONE = "DONE";
  private static final String DOING = "DOING";
  private static final List<String> OPEN = List.of("TODO", "DOING");

  private final TaskMapper tasks;
  private final TaskQueryMapper queries;

  public TaskRepository(TaskMapper tasks, TaskQueryMapper queries) {
    this.tasks = tasks;
    this.queries = queries;
  }

  public Optional<TaskRow> find(UUID spaceId, UUID eventId, UUID taskId) {
    return Optional.ofNullable(queries.find(TaskKey.of(spaceId, eventId, taskId)));
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

  public long count(UUID spaceId, UUID eventId) {
    return queries.countByEvent(TaskEventKey.of(spaceId, eventId));
  }

  public List<TaskListRow> list(UUID spaceId, UUID eventId, PageRequest request) {
    long offset = request.offset();
    if (offset > Integer.MAX_VALUE) {
      throw new IllegalArgumentException("page offset does not fit an int");
    }
    return queries.findPage(
        TaskListQuery.of(spaceId, eventId, PageParam.of((int) offset, request.size(), LIST_ORDER)));
  }

  @Transactional
  public int insert(UUID id, UUID spaceId, UUID eventId, String title, UUID assigneeUserId) {
    return tasks.insert(TaskInsert.of(id, spaceId, eventId, title, assigneeUserId));
  }

  @Transactional
  public int updateFields(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      String title,
      UUID assigneeUserId,
      String status,
      int versionDelta) {
    return tasks.updateFields(
        TaskFieldUpdate.of(spaceId, eventId, taskId, title, assigneeUserId, status, versionDelta));
  }

  @Transactional
  public int delete(UUID spaceId, UUID eventId, UUID taskId) {
    return tasks.delete(TaskKey.of(spaceId, eventId, taskId));
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
