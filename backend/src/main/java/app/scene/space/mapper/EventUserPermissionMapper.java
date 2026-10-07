package app.scene.space.mapper;

import app.scene.space.param.EventOperatorKey;
import app.scene.space.param.PermissionEffectQuery;
import app.scene.space.param.PermissionOverrideWrite;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventUserPermissionMapper {

  int save(PermissionOverrideWrite insert);

  int update(PermissionOverrideWrite update);

  int deleteOne(PermissionEffectQuery key);

  int delete(EventOperatorKey key);
}
