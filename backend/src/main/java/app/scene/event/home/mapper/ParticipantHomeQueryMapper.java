package app.scene.event.home.mapper;

import app.scene.event.home.HomeRow;
import app.scene.event.home.ParticipantValuesRow;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ParticipantHomeQueryMapper {

  HomeRow findHome(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId);

  ParticipantValuesRow findValues(
      @Param("spaceId") UUID spaceId,
      @Param("eventId") UUID eventId,
      @Param("participantId") UUID participantId);
}
