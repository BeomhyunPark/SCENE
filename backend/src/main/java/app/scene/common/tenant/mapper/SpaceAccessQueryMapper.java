package app.scene.common.tenant.mapper;

import app.scene.common.tenant.SpaceAccessRow;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SpaceAccessQueryMapper {

  SpaceAccessRow findSpace(@Param("spaceId") UUID spaceId, @Param("userId") UUID userId);
}
