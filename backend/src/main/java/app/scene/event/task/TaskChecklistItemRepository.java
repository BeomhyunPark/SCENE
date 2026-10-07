package app.scene.event.task;

import app.scene.event.task.mapper.TaskChecklistItemMapper;
import app.scene.event.task.mapper.TaskChecklistItemQueryMapper;
import app.scene.event.task.param.ChecklistItemKey;
import app.scene.event.task.param.ChecklistItemUpdate;
import app.scene.event.task.param.TaskKey;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class TaskChecklistItemRepository {

  private final TaskChecklistItemMapper items;
  private final TaskChecklistItemQueryMapper queries;

  public TaskChecklistItemRepository(
      TaskChecklistItemMapper items, TaskChecklistItemQueryMapper queries) {
    this.items = items;
    this.queries = queries;
  }

  public Optional<Boolean> findChecked(UUID spaceId, UUID eventId, UUID taskId, UUID itemId) {
    return Optional.ofNullable(
        queries.findChecked(ChecklistItemKey.of(spaceId, eventId, taskId, itemId)));
  }

  public List<ChecklistItemRow> findAll(UUID spaceId, UUID eventId, UUID taskId) {
    return queries.findAll(TaskKey.of(spaceId, eventId, taskId));
  }

  public ChecklistCounts count(UUID spaceId, UUID eventId, UUID taskId) {
    return queries.count(TaskKey.of(spaceId, eventId, taskId));
  }

  @Transactional
  public int deleteByTask(UUID spaceId, UUID eventId, UUID taskId) {
    return items.deleteByTask(TaskKey.of(spaceId, eventId, taskId));
  }

  @Transactional
  public int updateChecked(
      UUID spaceId,
      UUID eventId,
      UUID taskId,
      UUID itemId,
      boolean checked,
      UUID checkedByUserId,
      Instant checkedAt) {
    return items.updateChecked(
        ChecklistItemUpdate.of(
            spaceId, eventId, taskId, itemId, checked, checkedByUserId, checkedAt));
  }
}
