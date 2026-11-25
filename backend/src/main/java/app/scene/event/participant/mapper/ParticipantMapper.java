package app.scene.event.participant.mapper;

import app.scene.event.participant.ParticipantIdentity;
import app.scene.event.participant.param.ParticipantInsert;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ParticipantMapper {

  int save(ParticipantInsert insert);

  ParticipantIdentity findByPhoneKey(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("phoneKey") String phoneKey);

  ParticipantIdentity findById(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId);

  int updatePin(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId,
      @Param("pinHash") String pinHash,
      @Param("temporary") boolean temporary,
      @Param("now") java.time.Instant now);

  int updateName(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId,
      @Param("name") String name,
      @Param("now") java.time.Instant now);

  int updatePhone(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId,
      @Param("phone") String phone,
      @Param("phoneHash") String phoneHash,
      @Param("phoneLast4") String phoneLast4,
      @Param("phoneKey") String phoneKey,
      @Param("now") java.time.Instant now);
}
