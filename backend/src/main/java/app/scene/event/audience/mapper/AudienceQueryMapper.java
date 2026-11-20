package app.scene.event.audience.mapper;

import app.scene.event.audience.ParticipantAudience;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AudienceQueryMapper {

  ParticipantAudience.ViewerRow findViewer(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId);

  List<UUID> findActiveIds(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);

  List<UUID> findActiveLeaderIds(@Param("spaceId") UUID spaceId, @Param("eventId") UUID eventId);
}
