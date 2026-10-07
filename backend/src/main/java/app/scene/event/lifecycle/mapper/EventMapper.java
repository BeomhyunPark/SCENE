package app.scene.event.lifecycle.mapper;

import app.scene.event.lifecycle.EventLocation;
import app.scene.event.lifecycle.EventRow;
import app.scene.event.lifecycle.param.EventKey;
import app.scene.event.lifecycle.param.EventStatusUpdate;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventMapper {

  EventRow find(EventKey key);

  EventLocation findLocation(UUID eventId);

  EventRow findForUpdate(EventKey key);

  int updateStatus(EventStatusUpdate update);
}
