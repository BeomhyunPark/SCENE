package app.scene.event.participant.mapper;

import app.scene.event.participant.ParticipantAccessMatch;
import app.scene.event.participant.param.ParticipantAccessInsert;
import app.scene.event.participant.param.ParticipantAccessKey;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ParticipantAccessMapper {

  int save(ParticipantAccessInsert insert);

  List<ParticipantAccessMatch> findByKeyHash(ParticipantAccessKey key);
}
