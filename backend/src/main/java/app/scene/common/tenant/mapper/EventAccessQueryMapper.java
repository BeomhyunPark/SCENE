package app.scene.common.tenant.mapper;

import app.scene.common.tenant.EventAccessRow;
import app.scene.common.tenant.param.EventAccessQuery;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventAccessQueryMapper {

  EventAccessRow findEvent(EventAccessQuery query);
}
