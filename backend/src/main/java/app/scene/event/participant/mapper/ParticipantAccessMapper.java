package app.scene.event.participant.mapper;

import app.scene.event.participant.param.ParticipantAccessInsert;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ParticipantAccessMapper {

  int save(ParticipantAccessInsert insert);
}
