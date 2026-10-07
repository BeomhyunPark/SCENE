package app.scene.event.task.mapper;

import app.scene.event.task.param.TaskCompleteUpdate;
import app.scene.event.task.param.TaskReopenUpdate;
import app.scene.event.task.param.TaskStatusUpdate;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskMapper {

  int updateStatus(TaskStatusUpdate update);

  int updateCompleted(TaskCompleteUpdate update);

  int updateReopened(TaskReopenUpdate update);
}
