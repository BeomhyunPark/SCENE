package app.scene.event.participant.mapper;

import app.scene.event.participant.param.ParticipantSessionInsert;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ParticipantSessionMapper {

  int save(ParticipantSessionInsert insert);

  int deleteByTokenHash(@Param("tokenHash") String tokenHash);

  /** Every session of the participant except the one with {@code keepTokenHash} (may be null). */
  int deleteByParticipant(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId,
      @Param("keepTokenHash") String keepTokenHash);
}
