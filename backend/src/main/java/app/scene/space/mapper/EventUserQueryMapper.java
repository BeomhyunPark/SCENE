package app.scene.space.mapper;

import app.scene.space.OperatedEvent;
import app.scene.space.param.AuthorityQuery;
import app.scene.space.param.EventOperatorKey;
import app.scene.space.param.OperatedEventQuery;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EventUserQueryMapper {

  String findRole(EventOperatorKey key);

  String findRoleForUpdate(EventOperatorKey key);

  UUID findForUpdate(EventOperatorKey key);

  List<OperatedEvent> findOperated(OperatedEventQuery query);

  boolean existsAuthorityEnded(AuthorityQuery query);
}
