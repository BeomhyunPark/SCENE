package app.scene.event.updates.mapper;

import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OperatorUpdatesQueryMapper {

  /** The event's newest {@code checkin_logs.seq}, 0 with none. */
  long findCheckInSeq(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);
}
