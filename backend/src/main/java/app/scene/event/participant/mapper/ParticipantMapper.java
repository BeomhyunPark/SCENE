package app.scene.event.participant.mapper;

import app.scene.event.participant.param.ParticipantInsert;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ParticipantMapper {

  int save(ParticipantInsert insert);
}
