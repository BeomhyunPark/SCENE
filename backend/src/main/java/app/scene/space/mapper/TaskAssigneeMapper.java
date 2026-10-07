package app.scene.space.mapper;

import app.scene.space.param.AssigneeKey;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TaskAssigneeMapper {

  int updateCleared(AssigneeKey key);
}
