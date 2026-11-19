package app.scene.event.participant.mapper;

import app.scene.event.participant.ParticipantSelf;
import java.time.Instant;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ParticipantSessionQueryMapper {

  ParticipantSelf findByTokenHash(
      @Param("tokenHash") String tokenHash,
      @Param("now") Instant now,
      @Param("zone") String zone,
      @Param("daysAfterEnd") int daysAfterEnd);

  java.time.LocalDate findEventEndDate(
      @Param("spaceId") java.util.UUID spaceId, @Param("eventId") java.util.UUID eventId);
}
