package app.scene.event.task.mapper;

import app.scene.event.task.param.ChecklistItemUpdate;
import app.scene.event.task.param.TaskKey;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskChecklistItemMapper {

  int updateChecked(ChecklistItemUpdate update);

  int deleteByTask(TaskKey key);
}
