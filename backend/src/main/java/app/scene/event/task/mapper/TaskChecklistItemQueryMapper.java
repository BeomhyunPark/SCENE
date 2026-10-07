package app.scene.event.task.mapper;

import app.scene.event.task.ChecklistCounts;
import app.scene.event.task.param.ChecklistItemKey;
import app.scene.event.task.param.TaskKey;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskChecklistItemQueryMapper {

  Boolean findChecked(ChecklistItemKey key);

  ChecklistCounts count(TaskKey key);
}
