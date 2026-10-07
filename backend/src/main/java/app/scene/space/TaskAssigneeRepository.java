package app.scene.space;

import app.scene.space.mapper.TaskAssigneeMapper;
import app.scene.space.mapper.TaskAssigneeQueryMapper;
import app.scene.space.param.AssigneeKey;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class TaskAssigneeRepository {

  private final TaskAssigneeMapper tasks;
  private final TaskAssigneeQueryMapper queries;

  public TaskAssigneeRepository(TaskAssigneeMapper tasks, TaskAssigneeQueryMapper queries) {
    this.tasks = tasks;
    this.queries = queries;
  }

  public List<AssignedTask> findForUpdate(UUID spaceId, UUID eventId, UUID userId) {
    return queries.findForUpdate(AssigneeKey.of(spaceId, eventId, userId));
  }

  @Transactional
  public int updateCleared(UUID spaceId, UUID eventId, UUID userId) {
    return tasks.updateCleared(AssigneeKey.of(spaceId, eventId, userId));
  }
}
