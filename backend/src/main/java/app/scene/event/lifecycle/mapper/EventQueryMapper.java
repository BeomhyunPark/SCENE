package app.scene.event.lifecycle.mapper;

import app.scene.event.lifecycle.EventListRow;
import app.scene.event.lifecycle.EventProfile;
import app.scene.event.lifecycle.param.EventListQuery;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventQueryMapper {

  long count(EventListQuery query);

  List<EventListRow> findPage(EventListQuery query);

  EventProfile findProfile(UUID eventId);
}
