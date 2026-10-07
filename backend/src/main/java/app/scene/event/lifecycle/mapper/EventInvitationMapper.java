package app.scene.event.lifecycle.mapper;

import app.scene.event.lifecycle.InvitationRow;
import app.scene.event.lifecycle.param.InvitationInsert;
import app.scene.event.lifecycle.param.InvitationKey;
import app.scene.event.lifecycle.param.InvitationPendingClose;
import app.scene.event.lifecycle.param.InvitationRevoke;
import app.scene.event.lifecycle.param.InvitationSingleRevoke;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventInvitationMapper {

  InvitationRow find(InvitationKey key);

  InvitationRow findForUpdate(InvitationKey key);

  int save(InvitationInsert row);

  int supersedePending(InvitationPendingClose update);

  int revokePending(InvitationSingleRevoke update);

  int updateRevoked(InvitationRevoke update);
}
