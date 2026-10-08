package app.scene.event.lifecycle.mapper;

import app.scene.event.lifecycle.EventListRow;
import app.scene.event.lifecycle.param.EventListQuery;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventQueryMapper {

  long count(EventListQuery query);

  List<EventListRow> findPage(EventListQuery query);
}
