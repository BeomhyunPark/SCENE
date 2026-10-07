package app.scene.space.mapper;

import app.scene.space.param.EventOperatorKey;
import app.scene.space.param.EventOperatorRoleUpdate;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventUserMapper {

  int updateRole(EventOperatorRoleUpdate update);

  int save(EventOperatorRoleUpdate insert);

  int delete(EventOperatorKey key);
}
