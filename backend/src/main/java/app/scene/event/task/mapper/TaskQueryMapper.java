package app.scene.event.task.mapper;

import app.scene.event.task.TaskRow;
import app.scene.event.task.param.OpenTaskQuery;
import app.scene.event.task.param.TaskKey;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskQueryMapper {

  TaskRow find(TaskKey key);

  TaskRow findForUpdate(TaskKey key);

  int countOpen(OpenTaskQuery query);
}
