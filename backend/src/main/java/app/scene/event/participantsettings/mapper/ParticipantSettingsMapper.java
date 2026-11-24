package app.scene.event.participantsettings.mapper;

import app.scene.event.participantsettings.ParticipantSettingsRow;
import java.time.Instant;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ParticipantSettingsMapper {

  ParticipantSettingsRow find(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);

  int insertFirst(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("rosterVisible") boolean rosterVisible,
      @Param("updatedBy") UUID updatedBy,
      @Param("updatedAt") Instant updatedAt);

  int updateVersion(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("rosterVisible") boolean rosterVisible,
      @Param("expectedVersion") int expectedVersion,
      @Param("updatedBy") UUID updatedBy,
      @Param("updatedAt") Instant updatedAt);
}
