package app.scene.event.lifecycle.mapper;

import app.scene.event.lifecycle.param.InvitationRevoke;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventInvitationMapper {

  int updateRevoked(InvitationRevoke update);
}
