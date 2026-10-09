package app.scene.event.participant.mapper;

import app.scene.event.participant.param.ParticipantSessionInsert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ParticipantSessionMapper {

  int save(ParticipantSessionInsert insert);

  int deleteByTokenHash(@Param("tokenHash") String tokenHash);
}
