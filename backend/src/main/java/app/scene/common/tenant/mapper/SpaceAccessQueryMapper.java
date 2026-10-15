package app.scene.common.tenant.mapper;

import app.scene.common.tenant.SpaceAccessRow;
import app.scene.common.tenant.SpaceMembershipListRow;
import app.scene.common.tenant.param.SpaceMembershipListQuery;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SpaceAccessQueryMapper {

  SpaceAccessRow findSpace(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);

  long count(@Param("userId") UUID userId);

  List<SpaceMembershipListRow> findAll(SpaceMembershipListQuery query);
}
