package app.scene.space.mapper;

import app.scene.space.AssignedTask;
import app.scene.space.param.AssigneeKey;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskAssigneeQueryMapper {

  List<AssignedTask> findForUpdate(AssigneeKey key);
}
