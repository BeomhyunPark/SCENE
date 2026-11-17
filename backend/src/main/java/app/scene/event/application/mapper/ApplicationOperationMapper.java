package app.scene.event.application.mapper;

import app.scene.event.application.ApplicationOperationRow;
import app.scene.event.application.param.ApplicationKey;
import app.scene.event.application.param.EventApplicationKey;
import app.scene.event.application.param.OperationWrite;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

/** Operator values of applications (#335). */
@Mapper
public interface ApplicationOperationMapper {

  ApplicationOperationRow find(ApplicationKey key);

  List<ApplicationOperationRow> listByEvent(EventApplicationKey key);

  int insertFirst(OperationWrite write);

  int updateVersion(OperationWrite write);
}
