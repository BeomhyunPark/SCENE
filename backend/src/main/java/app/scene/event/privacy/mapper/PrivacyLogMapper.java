package app.scene.event.privacy.mapper;

import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PrivacyLogMapper {

  int insertParticipantAction(
      @Param("id") UUID id,
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("action") String action,
      @Param("actorParticipantId") UUID actorParticipantId,
      @Param("subjectParticipantId") UUID subjectParticipantId,
      @Param("channel") String channel,
      @Param("detail") String detail,
      @Param("occurredAt") Instant occurredAt);
}
