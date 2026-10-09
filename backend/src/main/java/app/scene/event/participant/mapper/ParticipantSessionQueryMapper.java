package app.scene.event.participant.mapper;

import app.scene.event.participant.ParticipantSelf;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ParticipantSessionQueryMapper {

  ParticipantSelf findByTokenHash(@Param("tokenHash") String tokenHash);
}
