package app.scene.event.task.mapper;

import app.scene.event.task.param.TaskCompleteUpdate;
import app.scene.event.task.param.TaskFieldUpdate;
import app.scene.event.task.param.TaskInsert;
import app.scene.event.task.param.TaskKey;
import app.scene.event.task.param.TaskReopenUpdate;
import app.scene.event.task.param.TaskStatusUpdate;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskMapper {

  int insert(TaskInsert insert);

  int updateFields(TaskFieldUpdate update);

  int delete(TaskKey key);

  int updateStatus(TaskStatusUpdate update);

  int updateCompleted(TaskCompleteUpdate update);

  int updateReopened(TaskReopenUpdate update);
}
