package app.scene.event.feed.mapper;

import app.scene.event.feed.FeedVersions;
import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ParticipantFeedVersionMapper {

  int bump(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("column") String column,
      @Param("at") Instant at);

  FeedVersions find(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);
}
