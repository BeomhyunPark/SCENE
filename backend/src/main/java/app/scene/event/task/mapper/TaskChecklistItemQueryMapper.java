package app.scene.event.task.mapper;

import app.scene.event.task.ChecklistCounts;
import app.scene.event.task.ChecklistItemRow;
import app.scene.event.task.param.ChecklistItemKey;
import app.scene.event.task.param.TaskKey;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskChecklistItemQueryMapper {

  Boolean findChecked(ChecklistItemKey key);

  List<ChecklistItemRow> findAll(TaskKey key);

  ChecklistCounts count(TaskKey key);
}
