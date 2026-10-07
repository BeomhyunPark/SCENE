package app.scene.space.mapper;

import app.scene.space.PermissionOverride;
import app.scene.space.param.EventOperatorKey;
import app.scene.space.param.PermissionEffectQuery;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventUserPermissionQueryMapper {

  String findEffect(PermissionEffectQuery query);

  String findSnapshot(EventOperatorKey key);

  List<PermissionOverride> findAll(EventOperatorKey key);
}
